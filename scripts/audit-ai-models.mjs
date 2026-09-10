#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Load project env files so keys in .env.local are picked up without needing to
// export them into the shell first. .env.local is loaded last so it wins.
for (const envFile of ['.env', '.env.local']) {
  const envUrl = new URL(`../${envFile}`, import.meta.url);
  try {
    process.loadEnvFile(fileURLToPath(envUrl));
  } catch {
    // File missing or unreadable — ignore and fall back to the ambient env.
  }
}

const registryUrl = new URL('../lib/ai-model-capabilities/registry.json', import.meta.url);
const registry = JSON.parse(await readFile(registryUrl, 'utf8'));

const providerConfigs = {
  openai: {
    env: ['OPENAI_API_KEY'],
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  anthropic: {
    env: ['ANTHROPIC_API_KEY'],
    url: 'https://api.anthropic.com/v1/models',
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
  },
  gemini: {
    env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    headers: (key) => ({ 'x-goog-api-key': key }),
  },
  grok: {
    env: ['XAI_API_KEY', 'GROK_API_KEY'],
    url: 'https://api.x.ai/v1/language-models',
    fallbackUrl: 'https://api.x.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepseek: {
    env: ['DEEPSEEK_API_KEY'],
    url: 'https://api.deepseek.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  kimi: {
    env: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    url: 'https://api.moonshot.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
};

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has('--json');
const providerArg = [...args].find((arg) => arg.startsWith('--provider='));
const selectedProvider = providerArg ? providerArg.slice('--provider='.length) : null;

if (args.has('--help')) {
  console.log(`Usage: node ${fileURLToPath(import.meta.url)} [--provider=openai] [--json]

Validates the source-controlled registry and, when provider API keys are present,
reports accessible model IDs that have no reviewed capability rule.`);
  process.exit(0);
}

if (selectedProvider && !(selectedProvider in providerConfigs)) {
  console.error(`Unknown provider: ${selectedProvider}`);
  process.exit(2);
}

const validationErrors = [];
const ruleIds = new Set();
if (typeof registry.version !== 'string' || !registry.version.trim()) {
  validationErrors.push('Registry version must be a non-empty string.');
}
if (!Array.isArray(registry.rules)) {
  validationErrors.push('Registry rules must be an array.');
}

for (const [index, rule] of (registry.rules || []).entries()) {
  const prefix = `rules[${index}]`;
  if (!rule?.id || typeof rule.id !== 'string') {
    validationErrors.push(`${prefix} is missing an id.`);
  } else if (ruleIds.has(rule.id)) {
    validationErrors.push(`${prefix} duplicates rule id ${rule.id}.`);
  } else {
    ruleIds.add(rule.id);
  }
  if (!(rule?.provider in providerConfigs)) {
    validationErrors.push(`${prefix} has unknown provider ${String(rule?.provider)}.`);
  }
  try {
    new RegExp(rule?.modelPattern);
  } catch (error) {
    validationErrors.push(
      `${prefix} has invalid modelPattern: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!/^https:\/\//.test(rule?.evidence?.url || '')) {
    validationErrors.push(`${prefix} must have an HTTPS evidence URL.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule?.evidence?.verifiedAt || '')) {
    validationErrors.push(`${prefix} must have a verifiedAt date in YYYY-MM-DD format.`);
  }
}

const extractItems = (data) => {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.models)) return data.models;
  return [];
};

const extractId = (provider, item) => {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  if (provider === 'gemini')
    return item.baseModelId || String(item.name || '').replace(/^models\//, '');
  return typeof item.id === 'string' ? item.id : '';
};

const fetchProviderModels = async (provider, config, key) => {
  const request = (url) =>
    fetch(url, {
      headers: { Accept: 'application/json', ...config.headers(key) },
      signal: AbortSignal.timeout(20_000),
    });
  let response = await request(config.url);
  if (!response.ok && config.fallbackUrl) {
    await response.text().catch(() => '');
    response = await request(config.fallbackUrl);
  }
  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  return [
    ...new Set(
      extractItems(data)
        .map((item) => extractId(provider, item))
        .filter(Boolean),
    ),
  ].sort();
};

const providers = selectedProvider ? [selectedProvider] : Object.keys(providerConfigs);
const results = [];
for (const provider of providers) {
  const config = providerConfigs[provider];
  const envName = config.env.find((name) => process.env[name]?.trim());
  if (!envName) {
    results.push({ provider, status: 'skipped', reason: `Set ${config.env.join(' or ')}` });
    continue;
  }
  try {
    const models = await fetchProviderModels(provider, config, process.env[envName].trim());
    const rules = registry.rules.filter((rule) => rule.provider === provider);
    const matched = [];
    const unmatched = [];
    for (const model of models) {
      const matchingRules = rules
        .filter((rule) => new RegExp(rule.modelPattern).test(model))
        .map((rule) => rule.id);
      if (matchingRules.length > 0) {
        matched.push({ model, rules: matchingRules });
      } else {
        unmatched.push(model);
      }
    }
    results.push({ provider, status: 'ok', modelCount: models.length, matched, unmatched });
  } catch (error) {
    results.push({
      provider,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const report = {
  registryVersion: registry.version,
  registryPath: fileURLToPath(registryUrl),
  validationErrors,
  providers: results,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`AI model capability registry ${registry.version}`);
  console.log(`Rules: ${registry.rules.length}; validation errors: ${validationErrors.length}`);
  for (const error of validationErrors) console.log(`  ERROR ${error}`);
  for (const result of results) {
    if (result.status === 'skipped') {
      console.log(`${result.provider}: skipped (${result.reason})`);
    } else if (result.status === 'error') {
      console.log(`${result.provider}: audit failed (${result.error})`);
    } else {
      console.log(
        `${result.provider}: ${result.modelCount} accessible; ${result.unmatched.length} unmatched`,
      );
      for (const model of result.unmatched) console.log(`  UNMATCHED ${model}`);
    }
  }
}

if (validationErrors.length > 0 || results.some((result) => result.status === 'error')) {
  process.exitCode = 1;
}
