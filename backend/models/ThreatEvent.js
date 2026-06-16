const mongoose = require('mongoose'); // Import mongoose to define database models and schemas

// Define the database schema for capturing cyber threat events
const threatEventSchema = new mongoose.Schema({
    a_c: { type: Number, default: 1 }, // Attack count - number of event occurrences (default: 1)
    a_n: { type: String, required: true }, // Attack name / threat signature description
    a_t: { type: String, required: true, enum: ['exploit', 'malware', 'phishing'] }, // Attack type category restricted to specific enums
    s_co: { type: String, required: true }, // Source country code (2-letter ISO or unknown)
    s_la: { type: Number, required: true }, // Source geographic latitude coordinate
    s_lo: { type: Number, required: true }, // Source geographic longitude coordinate
    d_co: { type: String, required: true }, // Destination country code (2-letter ISO)
    d_la: { type: Number, required: true }, // Destination geographic latitude coordinate
    d_lo: { type: Number, required: true }, // Destination geographic longitude coordinate
    s_ip: { type: String, default: 'unknown' }, // Source IP address or entity moniker (default: unknown)
    d_ip: { type: String, default: 'unknown' }, // Destination IP address, hostname or victim name (default: unknown)
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // Arbitrary threat metadata dictionary/object for scraper-specific details
    timestamp: { type: Date, default: Date.now, expires: 2592000 }, // Event record timestamp defaulting to current time, expiring in 30 days (2592000 seconds)
    source_api: { type: String, required: true } // Name of the scraper/API from which this threat intel was sourced
}); // Close the mongoose schema definition block

const ThreatEvent = mongoose.model('ThreatEvent', threatEventSchema); // Compile mongoose schema into a model class named ThreatEvent

module.exports = ThreatEvent; // Export the ThreatEvent model class to query and save events in the database
