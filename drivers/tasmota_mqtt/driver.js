'use strict';

const Homey = require('homey');
const MQTTClient = new Homey.ApiApp('nl.scanno.mqtt');

const PowerMeterCapabilities = [
        {
            field:  "Current",
            id:     "power_current",
            title:  {en: "Current"},
            unit:   "A",
            type:   "float",
            icon:   "assets/mobile/power_current.svg"
        },
        {
            field:  "Voltage",
            id:     "power_voltage",
            title:  {en: "Voltage"},
            unit:   "V",
            type:   "int",
            icon:   "assets/mobile/power_voltage.svg"
        },
        {
            field:  "Power",
            id:     "power_power",
            title:  {en: "Power"},
            unit:   "W",
            type:   "int",
            icon:   "assets/mobile/power_power.svg"
        },
        {
            field:  "ApparentPower",
            id:     "power_apparent_power",
            title:  {en: "Apparent Power"},
            unit:   "VA",
            type:   "int",
            icon:   "assets/mobile/power_power.svg"
        },
        {
            field:  "ReactivePower",
            id:     "power_reactive_power",
            title:  {en: "Reactive Power"},
            unit:   "VAr",
            type:   "int",
            icon:   "assets/mobile/power_power.svg"
        },
        {
            field:  "Factor",
            id:     "power_power_factor",
            title:  {en: "Power Factor"},
            unit:   "",
            type:   "float",
            icon:   "assets/mobile/power_factor.svg"
        },
        {
            field:  "Today",
            id:     "power_energy_today",
            title:  {en: "Energy Today"},
            unit:   "kWh",
            type:   "float",
            icon:   "assets/mobile/power_meter.svg"
        },
        {
            field:  "Yesterday",
            id:     "power_energy_yesterday",
            title:  {en: "Energy Yesterday"},
            unit:   "kWh",
            type:   "float",
            icon:   "assets/mobile/power_meter.svg"
        },
        {
            field:  "Total",
            id:     "power_energy_total",
            title:  {en: "Energy Total"},
            unit:   "kWh",
            type:   "float",
            icon:   "assets/mobile/power_meter.svg"
        }
    ];

class TasmotaDeviceDriver extends Homey.Driver {
    
    onInit() {
        this.log(this.constructor.name + ' has been inited');
        this.log('Manifest: ' + JSON.stringify(this.getManifest()));
        this.topics = ["stat", "tele"];
        this.devicesFound = {};
        this.searchingDevices = false;
        MQTTClient
            .register()
            .on('install', () => this.register())
            .on('uninstall', () => this.unregister())
            .on('realtime', (topic, message) => this.onMessage(topic, message));
        MQTTClient.getInstalled()
            .then(installed => {
                if (installed) {
                    this.register();
                }
            })
            .catch(error => {
                this.log(error)
            });
    }

    onPairListDevices( data, callback ) {
        this.log('onPairListDevices called');
        this.searchingDevices = true;
        this.devicesFound = {};
        this.sendMessage('cmnd/sonoffs/Status', '');   // Status
        this.sendMessage('cmnd/sonoffs/Status', '6');  // StatusMQT
        this.sendMessage('cmnd/sonoffs/Status', '2');  // StatusFWR
        this.sendMessage('cmnd/sonoffs/Status', '8');  // StatusSNS
        this.sendMessage('cmnd/tasmotas/Status', '');  // Status
        this.sendMessage('cmnd/tasmotas/Status', '6'); // StatusMQT
        this.sendMessage('cmnd/tasmotas/Status', '2'); // StatusFWR 
        this.sendMessage('cmnd/tasmotas/Status', '8'); // StatusSNS
        setTimeout(() => {
            this.searchingDevices = false;
            let devices = []
            for (let key in this.devicesFound)
            {
                let capabilities = [];
                let capabilitiesOptions = {};
                let relaysCount = this.devicesFound[key]['settings']['relays_number'];
                for (let propIndex = 0; propIndex < relaysCount; propIndex++)
                {
                    let capId = 'onoff.' + (propIndex + 1).toString();
                    capabilities.push(capId);
                    capabilitiesOptions[capId] = {title: { en: 'switch ' + (propIndex + 1).toString() }};
                    capabilitiesOptions[capId]['greyout'] = relaysCount === 1;
                }
                capabilities.push(relaysCount > 1 ? 'multiplesockets' : 'singlesocket');
                let mobile = undefined;
                if (this.devicesFound[key]['settings']['pwr_monitor'].length > 0)
                {
                    capabilities.push('measure_current');
                    capabilities.push('measure_voltage');
                    capabilities.push('measure_power');
                    capabilities.push('meter_power');
                    capabilities.push('measure_power_factor');
                    capabilities.push('measure_power_reactive');
                    capabilities.push('measure_apparent_power');
                    capabilities.push('meter_energy_today');
                    capabilities.push('meter_energy_yesterday');
                }
                try {
                    if (this.devicesFound[key]['data'] !== undefined)
                    {
                        let devItem = {
                            name:   (this.devicesFound[key]['name'] === undefined) ? key :  this.devicesFound[key]['name'],
                            data:   this.devicesFound[key]['data'],
                            class:  relaysCount == 1 ? 'socket' : 'other',
                            store: {
                            },
                            settings:   {
                                mqtt_topic:     this.devicesFound[key]['settings']['mqtt_topic'],
                                relays_number:  this.devicesFound[key]['settings']['relays_number'].toString(),
                                pwr_monitor:    this.devicesFound[key]['settings']['pwr_monitor'].length > 0 ? 'Yes' : 'No',
                                chip_type:      this.devicesFound[key]['settings']['chip_type'],
                            },
                            capabilities,
                            capabilitiesOptions
                        };
                        this.log('Device:',JSON.stringify(devItem));
                        devices.push(devItem);
                    }
                }
                catch (error) {
                }
            }
            callback( null, devices);
        }, 10000);

    }

    onMessage(topic, message) {
        let now = new Date();
        let topicParts = topic.split('/');
        if (this.searchingDevices && (topicParts[0] === 'stat'))
        {
            if ((topicParts.length == 3) && ((topicParts[2] == 'STATUS') || (topicParts[2] == 'STATUS6') || (topicParts[2] == 'STATUS8') || (topicParts[2] == 'STATUS2')))
            {
                try {
                    let deviceTopic = topicParts[1];
                    const msgObj = Object.values(message)[0];
                    if (this.devicesFound[deviceTopic] === undefined)
                        this.devicesFound[deviceTopic] = {settings: {mqtt_topic: deviceTopic, relays_number: 1, pwr_monitor: [], chip_type: 'unknown'}};
                    if (msgObj['FriendlyName'] !== undefined)
                    {
                        this.devicesFound[deviceTopic]['name'] = msgObj['FriendlyName'][0];
                        this.devicesFound[deviceTopic]['settings']['relays_number'] = msgObj['FriendlyName'].length;
                    }
                    if (msgObj['ENERGY'] !== undefined)
                    {
                        let energy = msgObj['ENERGY'];
                        let arrSize = PowerMeterCapabilities.length;
                        for (let key in energy)
                            for (let index=0; index < arrSize; index++)
                                if (key === PowerMeterCapabilities[index].field)
                                    this.devicesFound[deviceTopic]['settings']['pwr_monitor'].push(PowerMeterCapabilities[index]);
                    }
                    if (msgObj['MqttClient'] !== undefined)
                        this.devicesFound[deviceTopic]['data'] = { id: msgObj['MqttClient']};
                    if (msgObj['Hardware'] !== undefined)
                        this.devicesFound[deviceTopic]['settings']['chip_type'] = msgObj['Hardware'];
                }
                catch (error) {
                }
            }

        }
        if (this.topics.includes(topicParts[0]))
        {
            let devices = this.getDevices();
            for (let index = 0; index < devices.length; index++)
                if (devices[index].getMqttTopic() === topicParts[1])
                {
                    this.log("Hit: " + topic + " => " + JSON.stringify(message));
                    devices[index].processMqttMessage(topic, message);
                    break;
                }
        }
    }

    subscribeTopic(topicName) {
        return MQTTClient.post('subscribe', { topic: topicName }, error => {
            if (error) {
                    this.log(error);
            } else {
                this.log('sucessfully subscribed to topic: ' + topicName);
            }
        });
    }

    sendMessage(topic, payload)
    {
        try {
            MQTTClient.post('send', {
                qos: 0,
                retain: false,
                mqttTopic: topic,
                mqttMessage: payload
           });
        } catch (error) {
            this.log(error);
        }
    }

    register() {
        for  (let topic in this.topics)
            this.subscribeTopic(this.topics[topic] + "/#");
    }

    unregister() {
        this.log(this.constructor.name + " unregister called");
    }


}

module.exports = TasmotaDeviceDriver;