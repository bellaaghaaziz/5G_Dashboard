import streamlit as st
import pandas as pd
import joblib

# --- 1. SET UP THE PAGE ---
st.set_page_config(page_title="5G Master Handover AI", layout="wide")
st.title("📡 Smart 5G Master Handover Controller")
st.markdown("Adjust the telemetry on the left, then click the **Run AI Prediction** button!")

# --- 2. LOAD THE MODELS ---
@st.cache_resource
def load_models():
    s_dso1 = joblib.load('scaler_dso1.pkl')
    s_dso3 = joblib.load('scaler_dso3.pkl')
    m_dso1 = joblib.load('model_dso1_drop.pkl')
    m_dso2 = joblib.load('model_dso2_gain.pkl')
    m_dso3 = joblib.load('model_dso3_cluster.pkl')
    m_dso4 = joblib.load('model_dso4_master.pkl')
    return s_dso1, s_dso3, m_dso1, m_dso2, m_dso3, m_dso4

scaler_dso1, scaler_dso3, model_dso1, model_dso2, model_dso3, model_dso4 = load_models()

def get_features(model_or_scaler):
    if hasattr(model_or_scaler, 'feature_names_in_'):
        return list(model_or_scaler.feature_names_in_)
    elif hasattr(model_or_scaler, 'get_booster'):
        return list(model_or_scaler.get_booster().feature_names)
    return []

all_features = list(set(get_features(scaler_dso1) + get_features(model_dso2) + get_features(scaler_dso3)))
all_features.sort()

# --- 3. CREATE THE UI FORM WITH A BUTTON ---
user_inputs = {}

with st.sidebar.form("prediction_form"):
    st.header("📱 Core Telemetry (Easy)")
    
    # 1. The Understandable Columns
    core_cols = ['rsrp', 'sinr', 'velocity', 'mean_latency', 'num_neighbors', 'mean_neighbor_rsrp']
    
    # Safely create sliders if the model uses them
    if 'rsrp' in all_features: user_inputs['rsrp'] = st.slider("Signal Strength (RSRP dBm)", -140.0, -40.0, -95.0)
    if 'sinr' in all_features: user_inputs['sinr'] = st.slider("Signal Quality (SINR)", -10.0, 30.0, 10.0)
    if 'velocity' in all_features: user_inputs['velocity'] = st.slider("Speed (Velocity m/s)", 0.0, 40.0, 5.0)
    if 'mean_latency' in all_features: user_inputs['mean_latency'] = st.slider("Ping (Latency ms)", 10.0, 300.0, 40.0)
    if 'num_neighbors' in all_features: user_inputs['num_neighbors'] = st.number_input("Number of Neighbor Towers", 0, 5, 2)
    if 'mean_neighbor_rsrp' in all_features: user_inputs['mean_neighbor_rsrp'] = st.slider("Neighbor Avg Signal (dBm)", -140.0, -40.0, -90.0)

    # 2. The Confusing Columns (Hidden in a dropdown)
    st.markdown("---")
    with st.expander("⚙️ Advanced Network Metrics (Click to open)"):
        st.caption("These are background metrics required by the AI. You can leave them at their defaults.")
        for feat in all_features:
            if feat not in core_cols:
                # Give them a default value of 0 so they don't break the AI
                user_inputs[feat] = st.number_input(f"{feat}", value=0.0)
    
    # 3. THE MAGIC BUTTON
    submit_button = st.form_submit_button(label="🚀 Run AI Prediction")

# --- 4. RUN PIPELINE ONLY IF BUTTON IS CLICKED ---
if submit_button:
    df_all = pd.DataFrame([user_inputs])
    
    df_dso1 = df_all[get_features(scaler_dso1)]
    df_dso2 = df_all[get_features(model_dso2)]
    df_dso3 = df_all[get_features(scaler_dso3)]

    # Expert Opinions
    risk_score = model_dso1.predict_proba(scaler_dso1.transform(df_dso1))[0][1]
    predicted_gain = model_dso2.predict(df_dso2)[0]
    user_cluster = model_dso3.predict(scaler_dso3.transform(df_dso3))[0]

    # Master AI
    master_inputs = {
        'dso1_risk_score': risk_score,
        'dso2_predicted_gain': predicted_gain,
        'dso3_cluster': user_cluster,
        'rsrp': user_inputs.get('rsrp', -95.0),
        'velocity': user_inputs.get('velocity', 5.0)
    }
    
    dso4_df = pd.DataFrame([master_inputs])
    feat_dso4 = get_features(model_dso4)
    if feat_dso4: dso4_df = dso4_df[feat_dso4]
    final_decision = model_dso4.predict(dso4_df)[0]

    # --- 5. DISPLAY RESULTS ---
    col1, col2, col3 = st.columns(3)
    with col1:
        st.info("🔴 DSO1: Drop Risk")
        st.metric(label="Probability of Drop", value=f"{risk_score * 100:.1f}%")
    with col2:
        st.info("🟢 DSO2: Neighbor Gain")
        st.metric(label="Predicted Signal Boost", value=f"{predicted_gain:+.2f} dBm")
    with col3:
        st.info("🔵 DSO3: Network Profile")
        st.metric(label="User Cluster", value=f"Cluster {user_cluster}")

    st.markdown("---")
    if final_decision == 1:
        st.error("🚨 DECISION: TRIGGER HANDOVER (1)")
        st.markdown(f"> **AI Reasoning:** The user is in **Cluster {user_cluster}**. Drop risk is at **{risk_score*100:.1f}%**, and the neighbor tower offers a **{predicted_gain:+.2f} dBm** gain. Switching immediately to protect connection.")
    else:
        st.success("✅ DECISION: STAY ON CURRENT TOWER (0)")
        st.markdown(f"> **AI Reasoning:** The user is stable. The current risk is low (**{risk_score*100:.1f}%**) and a handover is unnecessary at this time.")
else:
    # This shows when the page first loads, before the button is clicked
    st.info("👈 Adjust the sliders on the left and click **'Run AI Prediction'** to see the results.")