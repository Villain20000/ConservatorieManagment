import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsUUID, Min, ValidateNested } from 'class-validator';

export class PerformanceOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  performanceId!: string;

  @IsInt()
  @Min(1)
  part!: number;

  @IsInt()
  @Min(1)
  orderIndex!: number;
}

export class ReorderPerformancesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceOrderItemDto)
  reorderedItems!: PerformanceOrderItemDto[];
}
