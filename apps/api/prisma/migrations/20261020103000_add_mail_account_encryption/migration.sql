-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN IF NOT EXISTS "encryption" TEXT NOT NULL DEFAULT 'starttls';

-- Migrate isSecure into encryption ('ssl' when isSecure is true or smtpPort is 465, otherwise 'starttls')
UPDATE "MailAccount"
SET "encryption" = CASE
  WHEN "isSecure" = true OR "smtpPort" = 465 THEN 'ssl'
  ELSE 'starttls'
END;
