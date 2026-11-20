import { IsString, IsOptional, MinLength } from 'class-validator';

/**
 * Data Transfer Object for disabling two‑factor authentication.
 * The backend requires the user to provide their current password for
 * re‑authentication and optionally a TOTP or backup code.
 */
export class DisableTwoFactorDto {
  /**
   * Current account password (or password field name used previously).
   * Required for security – prevents an attacker with a valid session from
   * silently turning off 2FA.
   */
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  currentPassword: string;

  /**
   * The 2FA code (TOTP) or a backup recovery code. Optional because the
   * service will also accept a password‑only request when the policy does not
   * require a code.
   */
  @IsOptional()
  @IsString()
  code?: string;
}
