import { IsNumber, IsOptional } from "class-validator";

export class PredictionInputDto {
  @IsNumber() @IsOptional() rsrp?: number;
  @IsNumber() @IsOptional() rsrq?: number;
  @IsNumber() @IsOptional() sinr?: number;
  @IsNumber() @IsOptional() cqi?: number;
  @IsNumber() @IsOptional() velocity?: number;
  @IsNumber() @IsOptional() num_neighbors?: number;
  @IsNumber() @IsOptional() datarate?: number;
  @IsNumber() @IsOptional() ho_count_60s?: number;
  @IsNumber() @IsOptional() time_since_last_ho?: number;
}
