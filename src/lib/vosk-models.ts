export interface VoskModelConfig {
  language: string;
  name: string;
  url: string;
  size: string;
  description: string;
}

export const VOSK_MODELS: Record<string, VoskModelConfig> = {
  'es': {
    language: 'es',
    name: 'Spanish (Small)',
    url: 'https://d3o3mm5j7ykxw1.cloudfront.net/vosk-model-small-es-0.42.tar.gz',
    size: '~42MB',
    description: 'Spanish speech recognition model - small size, good accuracy'
  },
  'en': {
    language: 'en',
    name: 'English (Small)',
    url: 'https://d3o3mm5j7ykxw1.cloudfront.net/vosk-model-small-en-us-0.15.tar.gz',
    size: '~15MB',
    description: 'English speech recognition model - small size, good accuracy'
  }
};

// Alternative S3 URLs (if you want to use your S3 bucket directly)
export const VOSK_MODELS_S3: Record<string, VoskModelConfig> = {
  'es': {
    language: 'es',
    name: 'Spanish (Small)',
    url: 'https://vosk-models-ar.s3.amazonaws.com/vosk-model-small-es-0.42.tar.gz',
    size: '~42MB',
    description: 'Spanish speech recognition model from S3'
  },
  'en': {
    language: 'en',
    name: 'English (Small)',
    url: 'https://vosk-models-ar.s3.amazonaws.com/vosk-model-small-en-us-0.15.tar.gz',
    size: '~15MB',
    description: 'English speech recognition model from S3'
  }
};

export function getModelConfig(language: string, useS3: boolean = false): VoskModelConfig {
  const models = useS3 ? VOSK_MODELS_S3 : VOSK_MODELS;
  return models[language] || models['es']; // fallback to Spanish
}

export function getAvailableLanguages(): string[] {
  return Object.keys(VOSK_MODELS);
} 