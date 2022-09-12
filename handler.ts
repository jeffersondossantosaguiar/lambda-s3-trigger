import { S3Event } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import * as csv from 'fast-csv';

const s3 = new S3({ apiVersion: 'latest' });

export async function hello(event: S3Event, context, cb) {
  const promises = event.Records.map((record) => {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    const params: S3.GetObjectRequest = {
      Bucket: bucket,
      Key: key,
    };

    const stream = s3.getObject(params).createReadStream();

    return new Promise(function (resolve, reject) {
      csv.parseStream(stream, {
        headers: true
      }).on('data', (data) => {
        console.log(data);
      }).on('error', (error) => {
        console.error(error);
        reject(error);
      }).on('end', (rows) => {
        console.log(`Parsed ${rows} rows`);
        resolve(rows);
      });
    });
  });

  return Promise.all(promises);
}