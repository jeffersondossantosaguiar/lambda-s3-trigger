export interface S3EventBridge {
  version: string,
  id: string,
  "detail-type": string,
  source: string,
  account: string,
  time: string,
  region: string,
  resources: string[],
  detail: {
    version: string,
    bucket: {
      name: string;
    },
    object: {
      key: string,
      size: number,
      etag: string,
      sequencer: string;
    },
    "request-id": string,
    requester: string,
    "source-ip-address": string,
    reason: string;
  };
};