require('dotenv').config()

const express = require('express')
const app = express()
const port = process.env.PORT || 3001

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require("fs");

const path = require('path');
const { start } = require('repl');

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA:ECDHE-RSA-AES128-GCM-SHA256'

const loaderOptions = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};
// // there is a porblem wih vercel here
const packageDefinition = protoLoader.loadSync('lightning.proto', loaderOptions);

let m = fs.readFileSync(process.env.PATH_TO_MACAROON);
let macaroon = m.toString('hex');
//let macaroon = process.env.MACAROON

let metadata = new grpc.Metadata()
metadata.add('macaroon', macaroon)
let macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
  callback(null, metadata);
});

let sslCreds = grpc.credentials.createSsl();
let credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

let lnrpcDescriptor = grpc.loadPackageDefinition(packageDefinition);
let lnrpc = lnrpcDescriptor.lnrpc;
let client = new lnrpc.Lightning(process.env.HOST_PORT, credentials);

app.get('/', (req, res) => {
  res.send('running!')
})

app.get("/getinfo", function (req, res) {
  client.getInfo({}, function(err, response) {
      if (err) {
        console.log('Error: ' + err);
      }
      res.json(response);
    });
});

app.get("/generate-invoice/:source/:price", function (req, res) {
  let request = { 
    value: req.params['price'],
    memo: req.params['source'],
    expiry: 120
  };

  client.addInvoice(request, function(err, response) {
    res.json(response);
  });
});

app.get("/check-invoice-steam/:payment_request", function (req, res) {
  let dataReturn = {} 
  let stream = client.subscribeInvoices({}) //This seems to be right place to subscribeInvoices
  
  stream.on('data', (data) => {
    console.log("### DATA")
    console.log(data)
    //console.log(data.settled)

    //This check for the correct invoice is important. If not doen all connected users will be marked as setteled 
    if (data.settled === true && data.payment_request === req.params['payment_request']) { 
      dataReturn = data 
      stream.destroy()
    }
  });

  stream.on('close', () =>  {
    console.log("### CLOSE")
    res.json(dataReturn)
  });
});

app.get('/file/:source', function (req, res, next) {
  var options = {
    dotfiles: 'deny',
    headers: {
      'x-timestamp': Date.now(),
      'x-sent': true
    }
  }

  var fileName = path.join(path.join(__dirname, 'static'))
  res.download(path.join(__dirname, 'static', req.params['source']), req.params['source'], options, function (err) {
    if (err) {
      next(err)
    } else {
      console.log('Sent:', fileName)
    }
  })
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})