const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function testUpload() {
  const tmpFile = path.join(__dirname, 'test-upload-sample.pdf');
  fs.writeFileSync(tmpFile, '%PDF-1.4 CRM File Upload Verification Sample Document');
  console.log('Created sample test file:', tmpFile);

  try {
    const loginRes = await axios.post('http://localhost:3333/api/v1/auth/login', {
      identifier: process.env.TEST_USER_EMAIL || 'test@example.com',
      password: process.env.TEST_USER_PASSWORD || '',
    });

    const token = loginRes.data.accessToken;
    console.log('Successfully logged in as Company CRM Owner. Token acquired.');

    const form = new FormData();
    form.append('file', fs.createReadStream(tmpFile));

    const uploadRes = await axios.post(
      'http://localhost:3333/api/v1/inventory/purchase-documents/upload',
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log('Upload Successful!');
    console.log('File URL:', uploadRes.data.url);
    console.log('Uploaded Original Name:', uploadRes.data.originalName);
    console.log('Server Stored Filename:', uploadRes.data.filename);
  } catch (err) {
    console.error('Upload Failed:', err?.response?.data || err.message);
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
      console.log('Cleaned up temporary test file.');
    }
  }
}

testUpload();
