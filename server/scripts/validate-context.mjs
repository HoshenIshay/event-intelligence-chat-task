import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contextPath = path.resolve(__dirname, '../data/context.json');

const raw = fs.readFileSync(contextPath, 'utf8');
const context = JSON.parse(raw);
const companyProfile = context.companyProfile ?? context.company_profile ?? context.companyContext;
const events = Array.isArray(context.events) ? context.events : [];
const requiredEventFields = [
  'event_id',
  'event_date',
  'title',
  'summary',
  'region',
  'domain',
  'source_name',
  'source_url',
];

const failures = [];

if (!companyProfile || typeof companyProfile !== 'object') {
  failures.push('Missing company profile');
} else {
  if (companyProfile.name !== 'Asteron Systems') {
    failures.push(`Unexpected company name: ${companyProfile.name}`);
  }
  const expectedMarkets = ['European Union', 'North America', 'India', 'Southeast Asia'];
  const primaryMarkets = Array.isArray(companyProfile.primaryMarkets)
    ? companyProfile.primaryMarkets
    : [];
  if (primaryMarkets.length !== expectedMarkets.length || !expectedMarkets.every((market) => primaryMarkets.includes(market))) {
    failures.push(`Unexpected primary markets: ${JSON.stringify(primaryMarkets)}`);
  }
}

if (events.length !== 30) {
  failures.push(`Expected 30 events, received ${events.length}`);
}

const eventIds = events.map((event) => event.event_id);
if (new Set(eventIds).size !== eventIds.length) {
  failures.push('Event IDs are not unique');
}

for (const [index, event] of events.entries()) {
  if (!event || typeof event !== 'object') {
    failures.push(`Event at index ${index} is not an object`);
    continue;
  }

  const missingFields = requiredEventFields.filter((field) => {
    const value = event[field];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missingFields.length) {
    failures.push(`Event ${event.event_id ?? index} missing required fields: ${missingFields.join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('Context validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'ok',
  eventCount: events.length,
  companyName: companyProfile.name,
  uniqueIds: new Set(eventIds).size,
}, null, 2));
