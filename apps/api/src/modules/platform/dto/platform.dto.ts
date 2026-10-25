import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetTenantStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'TRIAL'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'TRIAL';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ChangeTenantPlanDto {
  @IsString()
  @MaxLength(60)
  planCode!: string;
}
