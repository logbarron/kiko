import { escapeHtml } from '../utils/escape';

type AttributeValue = string | boolean | null | undefined;

type AttributeMap = Record<string, AttributeValue>;

export interface ThemePictureOptions {
  lightSrc: string;
  darkSrc: string;
  alt: string;
  wrapperClass?: string;
  imgClass?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
  media?: string;
  type?: string;
  pictureAttributes?: AttributeMap;
  sourceAttributes?: AttributeMap;
  imageAttributes?: AttributeMap;
}

export function renderThemePicture({
  lightSrc,
  darkSrc,
  alt,
  wrapperClass,
  imgClass,
  loading = 'lazy',
  decoding = 'async',
  media = '(prefers-color-scheme: dark)',
  type = 'image/webp',
  pictureAttributes,
  sourceAttributes,
  imageAttributes
}: ThemePictureOptions): string {
  const pictureAttrs: AttributeMap = {
    'data-theme-picture': true,
    ...(wrapperClass ? { class: wrapperClass } : {}),
    ...pictureAttributes
  };

  const sourceAttrs: AttributeMap = {
    srcset: darkSrc,
    type,
    'data-theme-source': true,
    ...(media ? { media } : {}),
    ...sourceAttributes
  };

  const imageAttrs: AttributeMap = {
    src: lightSrc,
    alt,
    'data-theme-image': true,
    'data-theme-light': lightSrc,
    'data-theme-dark': darkSrc,
    ...(imgClass ? { class: imgClass } : {}),
    ...(loading ? { loading } : {}),
    ...(decoding ? { decoding } : {}),
    ...imageAttributes
  };

  if (!sourceAttrs['data-default-media'] && media) {
    sourceAttrs['data-default-media'] = media;
  }

  return [
    `<picture${renderAttributes(pictureAttrs)}>`,
    `  <source${renderAttributes(sourceAttrs)}>`,
    `  <img${renderAttributes(imageAttrs)}>`,
    `</picture>`
  ].join('\n');
}

function renderAttributes(attrs: AttributeMap): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => {
      if (value === true || value === null) {
        return ` ${key}`;
      }
      return ` ${key}="${escapeHtml(String(value))}"`;
    })
    .join('');
}
