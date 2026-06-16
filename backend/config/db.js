const mongoose = require('mongoose'); // Import the Mongoose library to interact with MongoDB

// Define an asynchronous function to establish connection to the database
const connectDB = async () => {
    try { // Start a try-catch block to handle database connection errors
        // Determine MongoDB connection URI using env variable or fallback default local URL
        const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/threatmap';
        await mongoose.connect(uri); // Await the mongoose connection promise using the selected URI
        console.log(`[MongoDB] Connected properly to ${uri}`); // Log successful database connection message
    } catch (error) { // Catch block to capture database connection failures
        console.error('[MongoDB] Connection error:', error.message); // Log connection error details
        process.exit(1); // Terminate process with exit code 1 to indicate failure
    } // Close try-catch error block
}; // Close connectDB function definition

module.exports = connectDB; // Export the connectDB function to be used by other parts of the application
