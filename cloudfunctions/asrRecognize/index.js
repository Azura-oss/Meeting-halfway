const cloud = require('wx-server-sdk');
const { asr } = require('tencentcloud-sdk-nodejs-asr');
const { createAsrHandler } = require('./lib/handler');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function createAsrClient() {
  const secretId = process.env.TENCENTCLOUD_SECRETID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY;
  const token = process.env.TENCENTCLOUD_SESSIONTOKEN;

  if (!secretId || !secretKey) {
    const error = new Error('missing cloud function role credentials');
    error.code = 'CREDENTIALS_MISSING';
    throw error;
  }

  const AsrClient = asr.v20190614.Client;
  return new AsrClient({
    credential: {
      secretId,
      secretKey,
      token
    },
    region: '',
    profile: {
      httpProfile: {
        endpoint: 'asr.tencentcloudapi.com'
      }
    }
  });
}

exports.main = createAsrHandler({
  cloud,
  createAsrClient,
  engine: process.env.ASR_ENGINE || '16k_zh',
  timeoutMs: Number(process.env.ASR_TIMEOUT_MS) || 8000,
  logger: console
});
