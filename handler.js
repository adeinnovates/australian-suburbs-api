const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const stream = require('stream');
const { promisify } = require('util');

const S3_BUCKET = process.env.S3_BUCKET;
const S3_KEY = process.env.S3_KEY;

// Create an S3 client using AWS SDK v3
const s3Client = new S3Client({ region: 'eu-west-1' }); // Replace 'us-east-1' with your region

const fetchJSONFromS3 = async () => {
  const params = {
    Bucket: S3_BUCKET,
    Key: S3_KEY,
  };

  try {
    const command = new GetObjectCommand(params);
    const { Body } = await s3Client.send(command);

    console.log("fetchJSONFromS3 initiated")
    
    //
    const chunks = []; // Directly use chunks array

    console.log("Starting data stream processing..."); // More descriptive log

    await new Promise((resolve, reject) => {
      Body.on('data', (chunk) => {
        console.log("Data chunk received:", chunk.length);
        chunks.push(chunk);
      })
      .on('error', (error) => {
        console.error("Error in data stream:", error);
        reject(error); // Reject the promise on error
      })
      .on('end', () => {
        console.log("Data stream ended."); 
        resolve(); // Resolve the promise when the stream ends
      });
    });

    console.log("Data stream processing complete."); // Log after stream handling

    const jsonString = Buffer.concat(chunks).toString('utf-8');
    console.log('jsonString length:', jsonString.length);
   // .then(() => { 

      try {
        return JSON.parse(jsonString); 
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        console.log('jsonString (first 500 chars):', jsonString.substring(0, 500));
        throw parseError; 
      }
    //})
  } catch (error) {
    console.error('Error fetching JSON from S3', error);
    throw error; // Re-throw to allow Lambda to handle the error
  }
};

const groupDataByState = (data) => {
  console.log('groupDataByState input:', data);
  const states = {};

  // Check if 'data' has a 'states' property which is an array
  if (data && data.states && Array.isArray(data.states)) { 
    data.states.forEach((stateData) => { // Iterate over 'states' array
      const stateName = stateData['name']; // Get state name
      states[stateName] = {}; // Initialize state in the output object

      // Iterate over 'lgas' within each state
      stateData.lgas.forEach((lgaData) => { 
        const lgaName = lgaData['name']; 
        states[stateName][lgaName] = lgaData.suburbs.map(suburb => suburb.name); // Extract suburb names
      });
    });
  } else {
    console.error('Data is not in the expected format:', data);
    // Handle the error appropriately (throw an error or return an empty object)
  }

  console.log('groupDataByState output:', states);
  return states;
};

module.exports.getLocation = async (event) => {
  const state = event.queryStringParameters ? event.queryStringParameters.state : null;

  try {
    console.log('Starting function execution'); 
    console.log('S3_BUCKET:', S3_BUCKET); // Log environment variables
    console.log('S3_KEY:', S3_KEY);

    const startTime = Date.now();

    console.log('Initiating S3 GetObjectCommand'); // Track S3 interaction
    //
    console.log('Initiating S3 GetObjectCommand');
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: S3_KEY });

    console.log('Sending S3 GetObjectCommand'); // Add before sending
    const { Body } = await s3Client.send(command); 
    console.log('S3 GetObjectCommand successful'); // Add after successful response
    //
    
    const jsonData = await fetchJSONFromS3();
    
    console.log('jsonData:', jsonData); // Log parsed JSON
    const data = groupDataByState(jsonData);

    if (state) {
      const stateData = data[state];
      if (!stateData) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'State not found' }),
        };
      }
      return {
        statusCode: 200,
        body: JSON.stringify({ state: state, suburbs: stateData }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('Error fetching or processing data', error);
    console.log(error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error'+error.message }),
    };
  }
};