export type UserRole = "admin" | "network_operator" | "data_scientist";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PredictionResponse {
  dso1_risk_score: number;
  dso3_cluster: number;
  dso3_label: string;
  dso4_probability: number;
  dso4_threshold: number;
  handover_recommended: boolean;
  decision_source: string;
  latency_ms: number;
}
