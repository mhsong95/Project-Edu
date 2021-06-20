# AI Mediator

Example website for P2P video conference featuring AI Mediator.
AI Mediator features transcription of each participant's utterances and summarization of the transcripts.
This project demonstrates how AI Mediator can work on a simple video conferencing environment.

# Installation

1. Install node modules: `npm install`
2. (required) Place a Google Cloud project's API key file in the parent(`../`) directory of the project root. (Speech-to-text API usage should be enabled in the project)
3. (required) Copy `config.example.js` into `config.js`, then edit the file according to your project ID and key file name. For more information about issuing Google Cloud API key, [visit here](https://cloud.google.com/speech-to-text/docs/quickstart-client-libraries?hl=ko)
4. Install requirements of summarizer: `pip3 install -r summarizer/requirements.txt` (you may want to use venv). 

You may want to install and run the summarizer in a separate machine (of high performance, possibly with GPUs), because it consumes lots of resources. In that case, edit `summaryHost` in `config.js` file so that it points to the machine you installed the summarizer.

# Running the code

1. (optional) Run summarizer: `npm run summarizer`
2. Run Peerjs server: `npm run peer`
3. Run the main server: `npm run server`, then open your browser at `https://localhost:8000` or `https://your-host-ip-or-url:8000`. 
4. A page is rendered to enter a room name and passcode. Enter them and click `CREATE` button.
5. You will be redirected to another page for a room. Enter your name to use in the room, then `Invite` others.
6. Say something (in English) and see what happens.

# Explanation

The project consists of 3 servers: 

1. **Main server**: Manages each conference room, handles signaling of P2P connections, receives user audio input and makes requests for transcription and summary
2. **Peer server**: Helps establishing P2P connections between peers. Data is not proxied through the server. It just helps peers negotiate their WebRTC capabilities and routes.
3. **Summary server**: Listens to requests for summary of paragraphs. 

The first two are required to make video conferences possible. If you do not run **summary server**, the conference still works fine, but only transcripts (without summary) will be provided.

# Notes

- This project uses Google Cloud speech-to-text API for transcription of utterances. Specifically, it uses streaming recognition feature, and its usage is calculated based on length (time) of transcribed utterances. Each participant in a room is assigned to an individual recognition stream. Meaning that **API usage will be roughly (# of participants) X (duration of the conference)**. Please keep that in mind. 

- Since the video conferences are done in pure P2P (mesh) manner, up to 5-6 participants are allowed for a room. As the number of participants increase, there will be severe delays on video & audio playbacks. The bottleneck is at the client side, because each participant should send and receive their video & audio streams for each peer. Required network bandwidth and CPU workload for encoding and decoding each of the streams grow really fast as number of participants increase. **DO NOT INVITE too many people in a single room.** 

To make the conference better, you should use an SFU(Selective Forwarding Unit) server, such as [mediasoup](https://mediasoup.org/).
