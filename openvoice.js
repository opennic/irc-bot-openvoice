#!/usr/bin/env node

'use strict';

const cutOffUpper = 60000;
const cutOffLower = 15000;
const penaltyMultiplierUpper = 3;
const penaltyMultiplierLower = 2;
const initialTimerUpper = 15000;
const initialTimerLower = 10000;
const nickname = ' nickname here ';
const username = ' username here ';
const password = ' nickserv password here ';
const realname = 'Bot by Fusl';
const host = 'chat.freenode.net';
const port = 6697;
const tls = true;
const channels = ['#list', '#of', '#channels', '#goes', '#here'];
const kickreason = 'You\'re talking too soon. Please re-join and wait a minute before asking your questions.';

const timers = {};
const irc = require('irc-upd');
const async = require('async');

const client = new irc.Client(host, nickname, {
	userName: username,
	realName: realname,
	password: password,
	port: port,
	localAddress: null,
	debug: true,
	showErrors: false,
	channels: channels,
	autoConnect: true,
	autoRejoin: true,
	autoRenick: true,
	renickCount: null,
	renickDelay: 15000,
	retryCount: null,
	retryDelay: 2000,
	secure: tls,
	selfSigned: false,
	certExpired: false,
	floodProtection: true,
	floodProtectionDelay: 1000,
	sasl: true,
	stripColors: false,
	channelPrefixes: '&#',
	messageSplit: 512,
	encoding: null,
	millisecondsOfSilenceBeforePingSent: 900 * 1000,
	millisecondsBeforePingTimeout: 60 * 1000,
	enableStrictParse: false,
	//extendedJoin: true // only works with custom patched irc-upd version: https://github.com/Throne3d/node-irc/pull/67
});

const voicecargos = {};

channels.forEach(channel => {
	voicecargos[channel] = async.cargo((nicks, cb) => {
		const args = ['mode', channel, '+' + ('v'.repeat(nicks.length))].concat(nicks);
		client.send.apply(this, args);
		setTimeout(cb, 1000);
	}, 4);
});

const openVoice = (channel, nick) => {
	delete timers[channel + '\u0000' + nick];
	if (!voicecargos[channel]) return;
	voicecargos[channel].push(nick);
};

const handlePenalty = (channel, nick) => {
	if (!timers[channel + '\u0000' + nick]) return;
	let timeleft = timers[channel + '\u0000' + nick].time - (Date.now() - timers[channel + '\u0000' + nick].starttime);
	if (timeleft < 0) return;
	if (timeleft < cutOffLower) timeleft = cutOffLower;
	handleDisconnect(channel, nick);
	const newtime = timeleft * (Math.random() * (penaltyMultiplierUpper - penaltyMultiplierLower) + penaltyMultiplierLower);
	if (newtime > cutOffUpper) return triggerKick(channel, nick);
	handleConnect(channel, nick, newtime);
};

const triggerKick = (channel, nick) => {
	client.send('kick', channel, nick, kickreason);
};

const handleConnect = (channel, nick, time) => {
	if (timers[channel + '\u0000' + nick]) handleDisconnect(channel, nick);
	if (time === undefined) time = Math.random() * (initialTimerUpper - initialTimerLower) + initialTimerLower;
	console.log(nick + ' in ' + channel + ' will be voiced in ' + time + ' ms');
	timers[channel + '\u0000' + nick] = {
		timer: setTimeout(() => {
			openVoice(channel, nick);
		}, time),
		starttime: Date.now(),
		time: time
	}
};

const handleDisconnect = (channel, nick) => {
	if (!timers[channel + '\u0000' + nick]) return;
	clearTimeout(timers[channel + '\u0000' + nick].timer);
	delete timers[channel + '\u0000' + nick];
};

client.on('registered', () => {
	Object.keys(timers).forEach(channelnick => {
		const [channel, nick] = channelnick.split('\u0000');
		handleDisconnect(channel, nick);
	});
});

client.on('names', (channel, nicks) => {
	Object.keys(nicks).forEach(nick => {
		if (nicks[nick] === '') handleConnect(channel, nick);
	});
});

client.on('join', (channel, nick, message) => {
	if (message.args && message.args.length >= 2 && message.args[1] !== '*') return voicecargos[channel].push(nick);
	handleConnect(channel, nick);
});

client.on('part', (channel, nick, reason, message) => {
	handleDisconnect(channel, nick);
});

client.on('quit', (nick, reason, channels, message) => {
	channels.forEach(channel => {
		handleDisconnect(channel, nick);
	});
});

client.on('kick', (channel, nick, by, reason, message) => {
	handleDisconnect(channel, nick);
});

client.on('kill', (nick, reason, channels, message) => {
	console.log('kill', nick, reason, channels, message);
	channels.forEach(channel => {
		handleDisconnect(channel, nick);
	});
});

client.on('nick', (oldnick, newnick, channels, message) => {
	channels.forEach(channel => {
		if (!timers[channel + '\u0000' + oldnick]) return;
		const timeleft = timers[channel + '\u0000' + oldnick].time - (Date.now() - timers[channel + '\u0000' + oldnick].starttime);
		if (timeleft < 0) timeleft = 0;
		handleDisconnect(channel, oldnick);
		handleConnect(channel, newnick, timeleft);
	});
});

client.on('+mode', (channel, by, mode, argument, message) => {
	if (mode === 'v' || mode === 'o') {
		handleDisconnect(channel, argument);
	}
});

client.on('-mode', (channel, by, mode, argument, message) => {
	if (mode === 'v') {
		handleConnect(channel, argument);
	}
});

client.on('message', (nick, to, text, message) => {
	if (to[0] !== '#') return;
	handlePenalty(to, nick);
});

client.on('error', (message) => {
	console.log('error', message);
});

client.on('netError', (message) => {
	console.log('netError', message);
});
