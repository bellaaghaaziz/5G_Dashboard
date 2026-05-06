"""
5G Master Handover AI — Streamlit Dashboard
Uses the models produced by 5G_Handover_Pipeline_Clean.ipynb

Inference pipeline (in order):
  1. scaler_dso1  → model_dso1_xgb      → dso1_risk_score
  2. (no scaler)  → model_dso2_xgb_honest → dso2_neighbor_gain
  3. scaler_dso3  → model_dso3_kmeans    → dso3_cluster
  4. (no scaler)  → model_dso4_controller → handover decision
"""

import streamlit as st
import pandas as pd
import numpy as np
import joblib
import hmac
import json
import datetime

# ─── MUST be the very first Streamlit command ────────────────────────────────
st.set_page_config(
    page_title="5G Handover AI",
    page_icon="📡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─────────────────────────────────────────────────────────────────────────────
# AUTHENTICATION
# ─────────────────────────────────────────────────────────────────────────────
def check_password() -> bool:
    if st.session_state.get("authenticated"):
        return True

    st.markdown(
        "<h1 style='text-align:center; margin-top:10vh'>📡 5G Handover AI</h1>"
        "<p style='text-align:center; color:gray'>Enter your credentials to continue</p>",
        unsafe_allow_html=True,
    )
    col_l, col_m, col_r = st.columns([1, 1, 1])
    with col_m:
        username = st.text_input("Username", key="login_user")
        password = st.text_input("Password", type="password", key="login_pass")
        if st.button("Login", use_container_width=True, type="primary"):
            creds = st.secrets.get("credentials", {})
            if username in creds:
                if hmac.compare_digest(str(password), str(creds[username])):
                    st.session_state["authenticated"] = True
                    st.session_state["username"] = username
                    st.rerun()
                else:
                    st.error("❌ Wrong password")
            else:
                st.error("❌ User not found")
    return False


if not check_password():
    st.stop()


# ─────────────────────────────────────────────────────────────────────────────
# LOAD MODELS + FEATURE LISTS  (cached — loaded once per server process)
# ─────────────────────────────────────────────────────────────────────────────
@st.cache_resource(show_spinner="Loading AI models…")
def load_models():
    """Load all scalers, models, and feature lists from disk."""
    # Scalers
    scaler_dso1 = joblib.load("scaler_dso1.pkl")
    scaler_dso3 = joblib.load("scaler_dso3.pkl")

    # Models  — use the NEW filenames from the cleaned notebook
    model_dso1 = joblib.load("model_dso1_xgb.pkl")
    model_dso2 = joblib.load("model_dso2_xgb_honest.pkl")
    model_dso3 = joblib.load("model_dso3_kmeans.pkl")
    model_dso4 = joblib.load("model_dso4_controller.pkl")

    # Feature lists  — keys: dso1_features / dso2_features / dso3_features / dso4_features
    with open("model_feature_lists.json") as f:
        feature_lists = json.load(f)

    return scaler_dso1, scaler_dso3, model_dso1, model_dso2, model_dso3, model_dso4, feature_lists


scaler_dso1, scaler_dso3, model_dso1, model_dso2, model_dso3, model_dso4, feature_lists = load_models()

# Correct key names produced by the new notebook
DSO1_FEATS = feature_lists["dso1_features"]   # excludes dso3_cluster at training time
DSO2_FEATS = feature_lists["dso2_features"]
DSO3_FEATS = feature_lists["dso3_features"]
DSO4_FEATS = feature_lists["dso4_features"]   # full_dso4_features (is_ho already excluded)

# ─────────────────────────────────────────────────────────────────────────────
# DEFAULTS — physics-based starting values for every possible feature
# ─────────────────────────────────────────────────────────────────────────────
FEATURE_DEFAULTS: dict[str, float] = {
    # Core radio
    "rsrp":                    -95.0,
    "rsrq":                    -12.0,
    "sinr":                     10.0,
    "cqi":                       9.0,
    "tx_power":                 15.0,
    "ta":                        5.0,
    # Mobility
    "velocity":                  5.0,
    # Neighbour
    "num_neighbors":             2.0,
    "mean_neighbor_rsrp":      -90.0,
    "best_neighbor_rsrp":      -88.0,
    "neighbor_gap":              7.0,
    # Temporal
    "hour_of_day":    float(datetime.datetime.utcnow().hour),
    "day_of_week":    float(datetime.datetime.utcnow().weekday()),
    # Cell load
    "cell_hist_datarate_mean":  25.0,
    "cell_load_drop_flag":       0.0,
    # Engineered lags
    "rsrp_delta_3":              0.0,
    "sinr_delta_3":              0.0,
    "is_ho":                     0.0,
    "latency_is_imputed":        0.0,
    # DSO chain (placeholders — overwritten by pipeline)
    "dso3_cluster":              0.0,
    "dso1_risk_score":           0.0,
    "dso2_neighbor_gain":        0.0,
    # DSO3 extras (GPS, datarate — set to 0 when not available)
    "datarate":                  0.0,
    "latitude":                  0.0,
    "longitude":                 0.0,
}


def make_row(overrides: dict[str, float]) -> dict[str, float]:
    """Return a single feature row with defaults filled for every known feature."""
    row = {**FEATURE_DEFAULTS}
    row.update(overrides)
    return row


# ─────────────────────────────────────────────────────────────────────────────
# INFERENCE PIPELINE
# ─────────────────────────────────────────────────────────────────────────────
def run_pipeline(user_inputs: dict[str, float]) -> tuple[float, float, int, int]:
    """
    Execute the four-stage stacked inference pipeline.

    Returns
    -------
    risk_score      : float  — DSO1 degradation probability [0, 1]
    predicted_gain  : float  — DSO2 neighbour gain estimate (dBm)
    cluster         : int    — DSO3 network state cluster [0, 3]
    decision        : int    — DSO4 handover decision (0=stay, 1=handover)
    """
    row = make_row(user_inputs)

    # ── Stage 1: DSO1 — degradation risk ────────────────────────────────────
    # dso3_cluster is a placeholder (-1) at this point — consistent with training
    df1 = pd.DataFrame([{f: row.get(f, 0.0) for f in DSO1_FEATS}])
    X1  = scaler_dso1.transform(df1)
    risk_score = float(model_dso1.predict_proba(X1)[0][1])

    # ── Stage 2: DSO2 — neighbour gain ──────────────────────────────────────
    df2 = pd.DataFrame([{f: row.get(f, 0.0) for f in DSO2_FEATS}])
    predicted_gain = float(model_dso2.predict(df2)[0])

    # ── Stage 3: DSO3 — network state cluster ───────────────────────────────
    df3 = pd.DataFrame([{f: row.get(f, 0.0) for f in DSO3_FEATS}])
    X3  = scaler_dso3.transform(df3)
    cluster = int(model_dso3.predict(X3)[0])

    # ── Stage 4: DSO4 — handover controller (consumes DSO1/2/3 outputs) ────
    row["dso1_risk_score"]   = risk_score
    row["dso2_neighbor_gain"] = predicted_gain
    row["dso3_cluster"]       = float(cluster)
    df4 = pd.DataFrame([{f: row.get(f, 0.0) for f in DSO4_FEATS}])
    decision = int(model_dso4.predict(df4)[0])

    return risk_score, predicted_gain, cluster, decision


# ─────────────────────────────────────────────────────────────────────────────
# CLUSTER LABEL LOOKUP
# ─────────────────────────────────────────────────────────────────────────────
CLUSTER_LABELS = {
    0: ("🏢 Indoor / Static",   "Low velocity, stable signal"),
    1: ("🚆 H-Bahn (Rail)",     "High velocity, frequent handovers"),
    2: ("🚶 Pedestrian",        "Low speed, variable urban signal"),
    3: ("📶 Cell Edge",         "Weak signal, handover candidate"),
}


# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR — logout + input form
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(f"**👤 {st.session_state.get('username', '')}**")
    if st.button("Logout", use_container_width=True):
        st.session_state["authenticated"] = False
        st.rerun()

    st.markdown("---")
    st.header("📱 Telemetry Input")

    with st.form("prediction_form"):
        st.subheader("Core Signal")
        rsrp  = st.slider("RSRP — Signal Strength (dBm)", -140.0, -40.0, -95.0, step=1.0)
        rsrq  = st.slider("RSRQ — Signal Quality (dB)",   -20.0,   0.0, -12.0, step=0.5)
        sinr  = st.slider("SINR — Interference Ratio",    -10.0,  30.0,  10.0, step=0.5)
        cqi   = st.slider("CQI  — Channel Quality",         0,     15,     9)
        tx_pwr = st.slider("TX Power — Phone Transmit (dBm)", 0.0, 23.0, 15.0, step=0.5)
        ta    = st.slider("TA — Timing Advance (distance proxy)", 0, 63, 5)

        st.subheader("Mobility")
        velocity = st.slider("Speed (m/s)", 0.0, 40.0, 5.0, step=0.5)

        st.subheader("Neighbours")
        num_nbr  = st.number_input("Number of visible neighbours", 0, 8, 2)
        mean_nbr = st.slider("Mean neighbour RSRP (dBm)", -140.0, -40.0, -90.0, step=1.0)
        best_nbr = st.slider("Best neighbour RSRP (dBm)", -140.0, -40.0, -88.0, step=1.0)

        st.subheader("Temporal Context")
        hour_of_day = st.slider("Hour of Day (0–23)", 0, 23,
                                int(datetime.datetime.utcnow().hour))
        day_of_week = st.slider("Day of Week (0=Mon … 6=Sun)", 0, 6,
                                int(datetime.datetime.utcnow().weekday()))

        st.subheader("Signal History (Lag Features)")
        rsrp_delta_3 = st.slider("RSRP change over last 3 steps (dBm)", -20.0, 20.0, 0.0, step=0.5,
                                  help="Negative = signal already falling")
        sinr_delta_3 = st.slider("SINR change over last 3 steps", -10.0, 10.0, 0.0, step=0.5)

        st.subheader("Cell Load")
        cell_hist_rate = st.slider("Cell historical throughput (Mbps)", 0.0, 150.0, 25.0, step=1.0)
        cell_load_flag = st.checkbox("Cell congestion flag (bottom-25% hour)", value=False)

        submitted = st.form_submit_button("🚀 Run AI Prediction", use_container_width=True, type="primary")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN AREA
# ─────────────────────────────────────────────────────────────────────────────
st.title("📡 5G Master Handover Platform")

tab1, tab2, tab3 = st.tabs([
    "📡 Real-time Inference Pipeline", 
    "⚙️ MLOps & Platform Health",
    "☁️ Cloud & Infrastructure (K8s/Terraform)"
])

with tab1:
    st.caption("Stacked AI pipeline: DSO1 → DSO2 → DSO3 → DSO4")

    if not submitted:
        st.info("👈 Set the telemetry values in the sidebar and click **Run AI Prediction**.")
        st.stop()

    # Build user input dict and run pipeline
    user_inputs = {
        "rsrp":                    rsrp,
        "rsrq":                    rsrq,
        "sinr":                    sinr,
        "cqi":                     float(cqi),
        "tx_power":                tx_pwr,
        "ta":                      float(ta),
        "velocity":                velocity,
        "num_neighbors":           float(num_nbr),
        "mean_neighbor_rsrp":      mean_nbr,
        "best_neighbor_rsrp":      best_nbr,
        "neighbor_gap":            best_nbr - rsrp,
        "hour_of_day":             float(hour_of_day),
        "day_of_week":             float(day_of_week),
        "rsrp_delta_3":            rsrp_delta_3,
        "sinr_delta_3":            sinr_delta_3,
        "cell_hist_datarate_mean": cell_hist_rate,
        "cell_load_drop_flag":     1.0 if cell_load_flag else 0.0,
        "latency_is_imputed":      0.0,
        "is_ho":                   0.0,
    }

    with st.spinner("Running AI pipeline…"):
        risk_score, predicted_gain, cluster, decision = run_pipeline(user_inputs)

    # ── Final decision banner ────────────────────────────────────────────────────
    if decision == 1:
        st.error("## 🚨 HANDOVER RECOMMENDED", icon="🚨")
    else:
        st.success("## ✅ STAY ON CURRENT CELL", icon="✅")

    st.markdown("---")

    # ── Four KPI cards ──────────────────────────────────────────────────────────
    col1, col2, col3, col4 = st.columns(4)

    risk_pct = risk_score * 100
    risk_delta_color = "inverse" if risk_pct > 50 else "normal"
    col1.metric(
        "DSO1 — Drop Risk",
        f"{risk_pct:.1f}%",
        delta=f"{'High' if risk_pct > 50 else 'Low'} risk",
        delta_color=risk_delta_color,
    )

    gain_color = "normal" if predicted_gain > 0 else "inverse"
    col2.metric(
        "DSO2 — Neighbour Gain",
        f"{predicted_gain:+.2f} dBm",
        delta="Switch improves signal" if predicted_gain > 3 else "Marginal gain",
        delta_color=gain_color,
    )

    cluster_label, cluster_desc = CLUSTER_LABELS.get(cluster, (f"Cluster {cluster}", ""))
    col3.metric(
        "DSO3 — Network State",
        cluster_label,
        delta=cluster_desc,
        delta_color="off",
    )

    col4.metric(
        "DSO4 — Decision",
        "HANDOVER" if decision == 1 else "STAY",
        delta="Action required" if decision == 1 else "Hold position",
        delta_color="inverse" if decision == 1 else "normal",
    )

    st.markdown("---")

    # ── Input summary and pipeline trace ────────────────────────────────────────
    with st.expander("🔍 Full Pipeline Trace"):
        st.markdown("**Inputs used:**")
        input_df = pd.DataFrame([user_inputs]).T.rename(columns={0: "Value"})
        input_df.index.name = "Feature"
        st.dataframe(input_df.style.format("{:.3f}"), use_container_width=True)

        st.markdown("**Chained DSO outputs:**")
        chain_df = pd.DataFrame({
            "Stage": ["DSO1", "DSO2", "DSO3", "DSO4"],
            "Model": ["XGBoost Classifier", "XGBoost Regressor (honest)", "K-Means (k=4)", "XGBoost Controller"],
            "Output": [f"{risk_score:.4f} (risk prob)", f"{predicted_gain:.3f} dBm gain",
                       f"Cluster {cluster} — {cluster_label}", f"{'Handover (1)' if decision == 1 else 'Stay (0)'}"],
        })
        st.dataframe(chain_df, use_container_width=True, hide_index=True)

    # ── Risk gauge (simple visual) ───────────────────────────────────────────────
    st.markdown("### Risk Level")
    bar_color = "#e74c3c" if risk_pct > 60 else ("#f39c12" if risk_pct > 30 else "#2ecc71")
    st.markdown(
        f"""
        <div style="background:#eee; border-radius:8px; height:28px; width:100%; margin-bottom:4px">
          <div style="background:{bar_color}; width:{risk_pct:.1f}%; height:100%;
                      border-radius:8px; transition:width 0.5s;
                      display:flex; align-items:center; padding-left:10px; color:white; font-weight:bold">
            {risk_pct:.1f}%
          </div>
        </div>
        <p style="color:gray; font-size:0.85em; margin:0">
          0% = no risk of degradation &nbsp;|&nbsp; 100% = certain degradation
        </p>
        """,
        unsafe_allow_html=True,
    )

with tab2:
    st.header("⚙️ MLOps Pipeline Observability")
    st.markdown("Monitor AI drift, performance metrics, and retrain tracking.")
    
    col_ml1, col_ml2, col_ml3 = st.columns(3)
    
    with col_ml1:
        st.info("### 🔬 MLflow Tracker")
        st.markdown("**Tracking:** Model versions, HP tuning, Run History")
        st.markdown("[🔗 Open MLflow UI (Port 5000)](http://localhost:5000)")
        
    with col_ml2:
        st.warning("### 🪵 Kibana (ELK)")
        st.markdown("**Tracking:** Raw Data Logs, Payload validation, API queries")
        st.markdown("[🔗 Open Kibana UI (Port 5601)](http://localhost:5601)")

    with col_ml3:
        st.success("### 📊 Grafana Dashboards")
        st.markdown("**Tracking:** Prometheus API Latency, CPU/RAM, Request count")
        st.markdown("[🔗 Open Grafana UI (Port 3000)](http://localhost:3000)")
    
    st.markdown("---")
    st.subheader("🔄 Model Drift & Active Retraining Control")
    st.markdown("Manually trigger the retrain pipeline if data drift exceeds thresholds.")
    if st.button("🚀 Trigger Model Retrain Workflow", type="secondary"):
        st.success("Retrain workflow triggered. Check Jenkins/GitHub Actions or MLflow for progress.")

with tab3:
    st.header("☁️ Cloud Infrastructure (Terraform & K8s)")
    st.markdown("Real-time view of your Infrastructure as Code ecosystem.")
    
    st.markdown("### Architecture Components")
    col_inf1, col_inf2 = st.columns(2)
    with col_inf1:
        st.markdown("""
        **Kubernetes Deployments:**
        * `cellpilot-inference` (HPA Autoscaling bounds: 2 - 10 Replicas)
        * `prometheus` (Scraping interval: 5 seconds)
        * `grafana` (Dashboard engine)
        
        **To interact via CLI:**
        ```bash
        kubectl get pods -n cellpilot-mlops
        kubectl get hpa -n cellpilot-mlops
        ```
        """)
    with col_inf2:
        st.markdown("""
        **Terraform State (`infra/terraform`):**
        * Provider: Local/AWS/GCP (configured per env)
        * Handled resources: K8s Namespaces, Network policies.
        
        **Available Makefile Targets:**
        ```bash
        make tf-plan
        make tf-apply
        make k8s-apply
        ```
        """)