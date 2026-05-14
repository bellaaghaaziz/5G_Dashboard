import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { KafkaService } from "./kafka.service";

@WebSocketGateway({
  cors: { origin: "*", methods: ["GET", "POST"] },
  namespace: "/ws",
  transports: ["websocket", "polling"],
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(private readonly kafkaService: KafkaService) {}

  afterInit(_server: Server): void {
    if (this.kafkaService) {
      this.kafkaService.onBroadcast = (event: string, payload: unknown) => {
        this.server?.emit(event, payload);
      };
    }
    console.log("EventsGateway initialised on namespace /ws");
  }

  handleConnection(client: Socket): void {
    console.log(`WebSocket client connected: ${client.id}`);
    if (!this.kafkaService) return;
    client.emit("mapState",   this.kafkaService.getMapState());
    client.emit("towerStats", this.kafkaService.getTowerStats());
    client.emit("overview",   this.kafkaService.getOverview());
  }

  handleDisconnect(client: Socket): void {
    console.log(`WebSocket client disconnected: ${client.id}`);
  }
}
