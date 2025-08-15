// index.js

import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables from .env file
dotenv.config();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Express app
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// --- FACEBOOK WEBHOOK ENDPOINTS ---

// 1. Webhook Verification Endpoint
// Facebook sends a GET request to this endpoint to verify your webhook.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode are in the query string of the request
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

// 2. Message Handling Endpoint
// Facebook sends a POST request to this endpoint with the user's message.
app.post('/webhook', (req, res) => {
  const body = req.body;

  // Checks this is an event from a page subscription
  if (body.object === 'page') {
    // Iterates over each entry - there may be multiple if batched
    body.entry.forEach(entry => {
      // Gets the message. entry.messaging is an array, but 
      // will only ever contain one message, so we get index 0
      const webhook_event = entry.messaging[0];
      
      const sender_id = webhook_event.sender.id;
      const message_text = webhook_event.message?.text;

      if (message_text) {
        console.log(`Received message from ${sender_id}: "${message_text}"`);
        // Handle the message by calling Gemini and sending a reply
        handleMessage(sender_id, message_text);
      }
    });

    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

// --- HELPER FUNCTIONS ---

/**
 * Handles the incoming message, gets a response from Gemini, and sends it back.
 * @param {string} senderId The Facebook user ID of the sender.
 * @param {string} messageText The text of the message received.
 */
async function handleMessage(senderId, messageText) {
  try {
    console.log('Asking Gemini for a response...');
    
    // Add a prompt instruction for better results (optional, but recommended)
    const prompt = `You are a helpful assistant for our Facebook Page. Please answer the following question concisely and friendly:\n\nUser: ${messageText}\nAssistant:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text();

    console.log(`Gemini responded: "${aiText}"`);
    await sendReply(senderId, aiText);

  } catch (error) {
    console.error('Error handling message:', error);
    // Send a fallback message if AI fails
    await sendReply(senderId, "Sorry, I'm having a little trouble right now. Please try again later.");
  }
}

/**
 * Sends a text message back to the user using the Facebook Graph API.
 * @param {string} recipientId The Facebook user ID to send the message to.
 * @param {string} text The message text to send.
 */
async function sendReply(recipientId, text) {
  const request_body = {
    recipient: {
      id: recipientId,
    },
    message: {
      text: text,
    },
  };

  try {
    await axios.post('https://graph.facebook.com/v19.0/me/messages', request_body, {
      params: { access_token: FACEBOOK_PAGE_ACCESS_TOKEN },
    });
    console.log('Reply sent successfully!');
  } catch (error) {
    console.error('Unable to send message:', error.response?.data || error.message);
  }
}

// --- START THE SERVER ---
app.listen(PORT, () => {
  console.log(`Webhook server is listening on port ${PORT}`);
});