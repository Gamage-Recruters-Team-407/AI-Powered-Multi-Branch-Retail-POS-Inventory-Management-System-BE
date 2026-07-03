const dns = require('dns');
const { promisify } = require('util');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);
mongoose.set('bufferCommands', false);

const createResolver = () => {
	const resolver = new dns.Resolver();
	const servers = (process.env.MONGO_DNS_SERVERS || '8.8.8.8,1.1.1.1')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	resolver.setServers(servers.length ? servers : ['8.8.8.8', '1.1.1.1']);
	return {
		resolveSrv: promisify(resolver.resolveSrv.bind(resolver)),
		resolveTxt: promisify(resolver.resolveTxt.bind(resolver)),
	};
};

const parseSrvUri = (uri) => {
	const body = uri.replace('mongodb+srv://', '');
	const at = body.indexOf('@');
	const creds = body.slice(0, at);
	let rest = body.slice(at + 1);

	let host = rest;
	let path = '';
	let query = '';

	const slash = rest.indexOf('/');
	const qmark = rest.indexOf('?');

	if (slash !== -1) {
		host = rest.slice(0, slash);
		rest = rest.slice(slash);
		const qInPath = rest.indexOf('?');
		if (qInPath !== -1) {
			path = rest.slice(0, qInPath);
			query = rest.slice(qInPath);
		} else {
			path = rest;
		}
	} else if (qmark !== -1) {
		host = rest.slice(0, qmark);
		query = rest.slice(qmark);
	}

	return { creds, host, path, query };
};

const resolveMongoUri = async (uri) => {
	if (!uri || !uri.startsWith('mongodb+srv://')) {
		return uri;
	}

	const { resolveSrv, resolveTxt } = createResolver();
	const { creds, host, path, query } = parseSrvUri(uri);
	const srvName = `_mongodb._tcp.${host}`;

	const [srvRecords, txtRecords] = await Promise.all([
		resolveSrv(srvName),
		resolveTxt(srvName).catch(() => []),
	]);

	const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(',');
	const params = new URLSearchParams(query.replace(/^\?/, ''));

	for (const txt of txtRecords) {
		const entry = Array.isArray(txt) ? txt.join('') : String(txt);
		for (const part of entry.split('&')) {
			const [key, value] = part.split('=');
			if (key && value) params.set(key, value);
		}
	}

	if (!params.has('ssl') && !params.has('tls')) {
		params.set('ssl', 'true');
	}

	const qs = params.toString();
	return `mongodb://${creds}@${hosts}${path}${qs ? `?${qs}` : ''}`;
};

const connectDB = async () => {
	const mongoUri = process.env.MONGO_URI;
	const dbName = process.env.DB_NAME || 'retail_pos_db';

	if (!mongoUri) {
		console.warn('MONGO_URI is missing. Server started without MongoDB.');
		return null;
	}

	try {
		const resolvedUri = await resolveMongoUri(mongoUri);
		const conn = await mongoose.connect(resolvedUri, {
			dbName,
			serverSelectionTimeoutMS: 8000,
		});

		console.log(
			`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`,
		);

		return conn;
	} catch (error) {
		console.warn(`MongoDB connection failed: ${error.message}`);
		return null;
	}
};

module.exports = connectDB;
