const mongoose = require('mongoose');

const threatEventSchema = new mongoose.Schema({
    a_c: { type: Number, default: 1 },
    a_n: { type: String, required: true },
    a_t: { type: String, required: true, enum: ['exploit', 'malware', 'phishing'] },
    s_co: { type: String, required: true },
    s_la: { type: Number, required: true },
    s_lo: { type: Number, required: true },
    d_co: { type: String, required: true },
    d_la: { type: Number, required: true },
    d_lo: { type: Number, required: true },
    s_ip: { type: String, default: 'unknown' },
    d_ip: { type: String, default: 'unknown' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, expires: 2592000 },
    source_api: { type: String, required: true } 
});

const ThreatEvent = mongoose.model('ThreatEvent', threatEventSchema);

module.exports = ThreatEvent;
