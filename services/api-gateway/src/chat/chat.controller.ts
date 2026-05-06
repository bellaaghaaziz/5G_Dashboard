import { Body, Controller, Post, UseGuards, Logger, Inject, Get } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ChatService } from "./chat.service";

@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(@Inject(ChatService) private readonly chatService: ChatService) {
    this.logger.log("ChatController initialized");
  }

  @Post()
  async chat(@Body("messages") messages: any[]) {
    this.logger.log(`Received chat request with ${messages.length} messages`);
    if (!this.chatService) {
      this.logger.error("ChatService is UNDEFINED!");
      throw new Error("ChatService not initialized");
    }
    return this.chatService.chat(messages);
  }
}
