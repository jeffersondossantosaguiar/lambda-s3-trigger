import { S3 } from 'aws-sdk';
import * as csv from 'fast-csv';
import { pipeline, Transform } from 'stream';
import { promisify } from 'util';

const s3 = new S3({ apiVersion: 'latest' });
const pipelineAsync = promisify(pipeline);

export async function s3FileParser(event, context, cb) {

  const bucket = event.detail.bucket.name;
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '));

  const params: S3.GetObjectRequest = {
    Bucket: bucket,
    Key: key,
  };

  let fileSize;
  await s3.headObject(params).promise().then(result => fileSize = result.ContentLength);

  const chunkSize = +process.env['CHUNK_SIZE']!;

  console.log({ fileSize, chunkSize });

  let startByte = 0;

  console.log(event['s3FileParser']);

  if (!event['s3FileParser']) {
    let endByte = chunkSize;

    if (endByte > fileSize) endByte = fileSize;

    const range = `bytes=${startByte}-${endByte}`;
    const stream = s3.getObject({ ...params, Range: range }).createReadStream();

    await new Promise(function (resolve, reject) {
      let lastNewline = 0;
      stream
        .pipe(new Transform({
          transform(chunk, enconding, cb) {
            const dataString = chunk.toString();
            lastNewline = dataString.lastIndexOf('\n');

            cb(null, dataString.slice(0, lastNewline));
          }
        }))
        .pipe(csv.parse({
          headers: ['name', 'lat', 'lng', 'countryCode', 'adminName']
        }))
        .on('data', (data) => { console.log(data); })
        .on('error', (error) => {
          console.error(error);
          reject(error);
        })
        .on('end', (rows, data) => {
          console.log(`Parsed ${rows} rows`);
          const finalIteration = isFinalIteration(startByte, fileSize, chunkSize);

          console.log('FinalIteration', finalIteration);

          event['s3FileParser'] = {
            'results': {
              'startByte': startByte + lastNewline + 1,
              'finished': finalIteration
            }
          };
          resolve(event);
        });
    });
  }
  else {
    startByte = event['s3FileParser']['results']['startByte'];
    console.log({ startByte });
    let endByte = startByte + chunkSize;

    if (endByte > fileSize) endByte = fileSize;

    const finalIteration = isFinalIteration(startByte, fileSize, chunkSize);

    const range = `bytes=${startByte}-${endByte}`;
    const stream = s3.getObject({ ...params, Range: range }).createReadStream();

    let lastNewline = 0;

    await new Promise(function (resolve, reject) {
      stream
        .pipe(new Transform({
          transform(chunk, enconding, cb) {
            const dataString = chunk.toString();
            if (finalIteration) {
              cb(null, dataString);
            } else {

              lastNewline = dataString.lastIndexOf('\n');

              console.log(finalIteration);

              cb(null, dataString.slice(0, lastNewline));
            }
          }
        }))
        .pipe(csv.parse({
          headers: ['name', 'lat', 'lng', 'countryCode', 'adminName']
        }))
        .on('data', (data) => { console.log(data); })
        .on('error', (error) => {
          console.error(error);
          reject(error);
        })
        .on('end', (rows, data) => {
          console.log(`Parsed ${rows} rows`);
          console.log('FinalIteration', finalIteration);

          event['s3FileParser'] = {
            'results': {
              'startByte': startByte + lastNewline + 1,
              'finished': finalIteration
            }
          };

          resolve(rows);
        });
    });
  }

  console.log(event);
  return event;
}

function isFinalIteration(nextStartByte, fileSize, chunkSize) {
  if ((nextStartByte + chunkSize) >= fileSize) return true;
  else return false;
};