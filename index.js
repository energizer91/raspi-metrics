const http = require('http');
const config = require('config');
const mqtt = require('mqtt');
const client = require('prom-client');

const definedMetrics = {
  temperature: new client.Gauge({name: 'temperature', help: 'Temperature', labelNames: ['sno']}),
  humidity: new client.Gauge({name: 'humidity', help: 'Humidity', labelNames: ['sno']}),
  linkquality: new client.Gauge({name: 'linkquality', help: 'Link quality', labelNames: ['sno']}),
}

const register = new client.Registry();

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(404);
    res.write('not found');
    res.end();

    return;
  }

  if (req.url !== config.get('prometheus.url')) {
    res.writeHead(404);
    res.write('not found');

    return;
  }


  register.metrics()
    .then((metrics) => {
      res.setHeader('Content-Type', register.contentType);
      res.write(metrics);
      res.end();
    })
    .catch((err) => {
      res.writeHead(404);
      res.write(err.message);
      res.end();
    });
});

const mqttClient = mqtt.connect(config.get('mqtt.url'));

mqttClient.on('connect', () => {
  console.log('Successfully connected to MQTT');

  mqttClient.subscribe(config.get('mqtt.topic'), (err, granted) => {
    if (err) {
      console.error('Failed to subscribe to mqtt topic', err);
      return;
    }

    console.log('Successfully subscribed to topic', granted);
  });
});

mqttClient.on('message', (topic, message) => {
  console.log('Incoming message', topic, message.toString());

  let payload;

  try {
    payload = JSON.parse(message.toString())
  } catch (e) {
    console.error('Failed to decode topic message', topic, message.toString());
    return;
  }

  const sno = topic.split('/')[1];

  if (!sno) {
    console.error('Failed to get device id', topic);
    return;
  }

  Object.keys(payload).forEach((key) => {
    if (typeof payload[key] !== 'number' || isNaN(payload[key])) {
      return;
    }

    let metric = register.getSingleMetric(key);

    if (!metric) {
      metric = definedMetrics[key];

      if (metric) {
        register.registerMetric(metric);
      }
    }

    if (!metric) {
      metric = new client.Gauge({name: key, help: key, labelNames: ['sno']});
      register.registerMetric(metric);
    }

    metric.set({sno}, payload[key]);
  });
})

server.listen(config.get('http.port'), () => {
  console.log('Server is listening at port', config.get('http.port'));
})