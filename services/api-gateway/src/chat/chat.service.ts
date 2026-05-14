import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import axios from "axios";

@Injectable()
export class ChatService {
  private client: OpenAI;
  private readonly logger = new Logger(ChatService.name);

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("LLM_API_KEY");
    const baseURL = this.config.get<string>("LLM_BASE_URL");

    if (!apiKey || !baseURL) {
      throw new Error("LLM_API_KEY or LLM_BASE_URL is missing from environment variables!");
    }

    this.client = new OpenAI({ apiKey, baseURL });
    this.logger.log("ChatService initialized with vLLM/Llama");
  }

  private get dashboardServiceUrl() {
    return this.config.get<string>("DASHBOARD_SERVICE_URL", "http://localhost:3003");
  }

  private async getDashboardSummary() {
    try {
      const { data } = await axios.get(`${this.dashboardServiceUrl}/operator/overview`, { timeout: 3000 });
      const { data: health } = await axios.get(`${this.dashboardServiceUrl}/system/health`, { timeout: 3000 });
      return { kpis: data.kpis, alerts: data.alerts, systemHealth: health.overall };
    } catch (error: any) {
      this.logger.error(`Failed to fetch dashboard data: ${error.message}`);
      return null;
    }
  }

  async chat(messages: any[]) {
    this.logger.log(`Processing chat request with ${messages.length} messages`);
    try {
      const lastMessage = messages[messages.length - 1].content.toLowerCase();
      let contextInjection = "";

      const reportKeywords = ["report", "bericht", "summary", "status", "performance", "health", "rapport"];
      if (reportKeywords.some(kw => lastMessage.includes(kw))) {
        this.logger.log("Report requested, fetching real-time data...");
        const summary = await this.getDashboardSummary();
        if (summary) {
          contextInjection = `\n\n[REAL-TIME NETWORK DATA]\n${JSON.stringify(summary, null, 2)}\nUse this data to generate a detailed report.`;
        }
      }

      const systemPrompt = `You are Nexo AI, the intelligent assistant for the Nexo 5G Handover Intelligence Platform.

Your goal is to help users understand the platform, analyze 5G network performance, and explain AI-driven handover decisions.

[MULTILINGUAL SUPPORT]
- You are fluent in English, German, French, Spanish, and other major languages.
- ALWAYS respond in the same language the user uses.
- If the user asks for a report, provide it in a professional, structured format (using markdown tables and sections).

Key Platform Features:
1. DSO1 (Anomaly Detection): Identifies signal drops and network anomalies.
2. DSO2 (Target Cell Selection): Ranks neighboring cells based on predicted signal gain.
3. DSO3 (UE Clustering): Groups user equipment by mobility profiles (Pedestrian, Car, H-Bahn train, Static).
4. DSO4 (Handover Execution): Final binary decision to trigger a handover.

Network Context:
- Located in the Ruhr Region, Germany.
- Uses a 4-stage AI pipeline.
- Real-time KPIs include: Handover Success Rate, Avg Latency, High Risk Predictions.${contextInjection}

Be concise, professional, and helpful. Use technical 5G terms correctly (RSRP, SINR, TA, etc.).`;

      const model = this.config.get<string>("LLM_MODEL", "hosted_vllm/Llama-3.1-70B-Instruct");

      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: "system" as const, content: systemPrompt },
          ...messages.map(msg => ({
            role: (msg.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
            content: msg.content as string
          }))
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const responseText = response.choices[0].message.content || "";

      return {
        role: "assistant",
        content: responseText
      };
    } catch (error: any) {
      this.logger.error(`Error in ChatService: ${error.message}`, error.stack);
      return {
        role: "assistant",
        content: "Sorry, I encountered an error processing your request. Please try again later."
      };
    }
  }
}