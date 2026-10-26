import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EventCheckinDto {
  @IsString()
  @IsNotEmpty()
  ticketCode!: string;

  @IsBoolean()
  @IsOptional()
  overrideCapacity?: boolean;
}
