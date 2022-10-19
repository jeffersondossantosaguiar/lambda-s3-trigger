import { S3 } from 'aws-sdk';
import * as csv from 'fast-csv';
import { Transform } from 'stream';
import { S3EventBridge } from './interfaces/s3-event-bridge.interface';

const s3 = new S3({ apiVersion: 'latest' });
const chunkSize = +process.env['CHUNK_SIZE']!;

export async function s3FileParser(event: S3EventBridge) {

  const bucket = event.detail.bucket.name;
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '));

  const params: S3.GetObjectRequest = {
    Bucket: bucket,
    Key: key,
  };

  let fileSize: number | undefined = 0;

  await s3.headObject(params).promise().then(result => fileSize = result.ContentLength);

  if (!event['s3FileParser']) {
    const startByte = 0;
    let headers: string[];
    let endByte = chunkSize;

    if (endByte > fileSize) endByte = fileSize;

    const range = `bytes=${startByte}-${endByte}`;
    const stream = s3.getObject({ ...params, Range: range }).createReadStream();

    await new Promise(function (resolve, reject) {
      let lastNewline = 0;
      stream
        .pipe(new Transform({
          transform(chunk: Buffer, encoding, cb) {
            lastNewline = chunk.lastIndexOf('\n', -1);
            cb(null, chunk.subarray(0, lastNewline));
          }
        }))
        .pipe(csv.parse({ headers: true }))
        .on('headers', (h) => headers = h)
        .on('data', (data) => { console.log(data); }) //Data parsed 
        .on('error', (error) => {
          console.error(error);
          reject(error);
        })
        .on('end', (rows, data) => {
          console.log(`Parsed ${rows} rows`); //Total rows parsed
          const finalIteration = isFinalIteration(startByte, fileSize, chunkSize);
          event['s3FileParser'] = {
            'results': {
              'startByte': startByte + lastNewline + 1,
              'finished': finalIteration,
              'headers': headers
            }
          };
          resolve(event);
        });
    });
  }
  else {
    const startByte = event['s3FileParser']['results']['startByte'];
    const headers = event['s3FileParser']['results']['headers'];
    let endByte = startByte + chunkSize;
    let lastNewline = 0;

    if (endByte > fileSize) endByte = fileSize;

    const finalIteration = isFinalIteration(startByte, fileSize, chunkSize);
    const range = `bytes=${startByte}-${endByte}`;
    const stream = s3.getObject({ ...params, Range: range }).createReadStream();

    await new Promise(function (resolve, reject) {
      stream
        .pipe(new Transform({
          transform(chunk: Buffer, enconding, cb) {
            if (finalIteration) {
              cb(null, chunk);
            } else {
              lastNewline = chunk.lastIndexOf('\n', chunkSize - 500);
              cb(null, chunk.subarray(0, lastNewline));
            }
          }
        }))
        .pipe(csv.parse({ headers: [...headers] }))
        .on('data', (data) => { console.log(data); })
        .on('error', (error) => {
          console.error(error);
          reject(error);
        })
        .on('end', (rows, data) => {
          console.log(`Parsed ${rows} rows`);

          event['s3FileParser'] = {
            'results': {
              'startByte': startByte + lastNewline + 1,
              'finished': finalIteration,
              'headers': headers
            }
          };

          resolve(rows);
        });
    });

    if (finalIteration)
      console.log(event);
  }

  //console.log(event); //Event with s3FileParser Object
  return event;
}

function isFinalIteration(nextStartByte, fileSize, chunkSize) {
  if ((nextStartByte + chunkSize) >= fileSize) return true;
  else return false;
};