const fs = require('fs');
let code = fs.readFileSync('apps/api/src/main.ts', 'utf8');

// 1. Add imports
code = code.replace(
  "import { ValidationPipe } from '@nestjs/common';",
  "import { ValidationPipe, BadRequestException } from '@nestjs/common';\r\nimport { formatValidationErrors } from './common/validation-error.formatter';"
);

// 2. Replace ValidationPipe
const newPipe = `  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (validationErrors) => {
        const formatted = formatValidationErrors(validationErrors);
        if (formatted.hasUnknownField) {
          return new BadRequestException({
            statusCode: 400,
            code: 'UNKNOWN_FIELD',
            message: formatted.topMessage,
            fieldErrors: [],
            unknownFields: formatted.unknownFields,
          });
        }
        return new BadRequestException({
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          message: formatted.topMessage,
          fieldErrors: formatted.fieldErrors,
        });
      },
    }),
  );`;

code = code.replace(/app\.useGlobalPipes\([\s\S]*?new ValidationPipe\([\s\S]*?\}\),\r?\n\s*\);/, newPipe);
fs.writeFileSync('apps/api/src/main.ts', code);
console.log('Successfully updated apps/api/src/main.ts');
