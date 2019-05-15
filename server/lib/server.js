const express = require('express');
const { createServer } = require('http');
const io = require('socket.io');
const fs = require('fs');
const http = require('http');
const https = require('https');
const haiku = require('./haiku');

const app = express(),
    options = process.env.NODE_ENV !== 'production'? {} : {
    key: fs.readFileSync('/etc/ssl/private/nginx-selfsigned.key'),
    cert: fs.readFileSync('/etc/ssl/certs/nginx-selfsigned.crt')
    //key: fs.readFileSync(__dirname + '/../ssl_file.pem'),
   // cert: fs.readFileSync(__dirname + '/../ssl_file.crt')
  },
  server = process.env.NODE_ENV !== 'production' ?
                                                  http.createServer(app) :
                                                  https.createServer(options, app);

const userIds = {};
const phonebook = {
                    "1":{ id: 1, name: "Tuan" }
                    ,"2":{ id: 1, name: "Ngoc-Anh" }
                  };
const noop = () => {};

app.use('/', express.static(`${process.cwd()}/../client`));

/**
 * Random ID until the ID is not in use
 */
function randomID(callback) {
  const id = haiku();
  if (id in userIds) setTimeout(() => randomID(callback), 5);
  else callback(id);
}

/**
 * Send data to friend
 */
function sendTo(to, done, fail) {
  const receiver = userIds[to];
  if (receiver) {
    const next = typeof done === 'function' ? done : noop;
    next(receiver);
  } else {
    const next = typeof fail === 'function' ? fail : noop;
    next();
  }
}

/**
 * Initialize when a connection is made
 * @param {SocketIO.Socket} socket
 */
function initSocket(socket) {
  let id;
  socket
    .on('init', (data) => {
      console.log('init', data);
      let foundInBook = false;
      if(data.id) {
        if(phonebook[''+data.id]) {
          foundInBook = true;
          id = phonebook[''+data.id].name;
          userIds[id] = socket;
          socket.emit('init', { id });
        }
      }
      if(!foundInBook) {
        randomID((_id) => {
          id = _id;
          userIds[id] = socket;
          socket.emit('init', { id });
        });
      }
    })
    .on('request', (data) => {
      sendTo(data.to, receiver => receiver.emit('request', { from: id }));
    })
    .on('call', (data) => {
      sendTo(
        data.to,
        receiver => receiver.emit('call', { ...data, from: id }),
        () => socket.emit('failed')
      );
    })
    .on('end', (data) => {
      sendTo(data.to, receiver => receiver.emit('end'));
    })
    .on('disconnect', () => {
      if(!id) return;
      delete userIds[id];
      console.log(id, 'disconnected');
    });

  return socket;
}

module.exports.run = (config) => {
  server.listen(config.PORT);
  console.log(`Server is listening at :${config.PORT}`);
  io.listen(server, { log: true })
    .on('connection', initSocket);
};

