import { DEFAULT_IMAGE_ID } from '../shared/imageSelection'

const imageModules = import.meta.glob('../../assets/characters/*/vivian_static_*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const LABELS = ['大笑', '无语', '委屈', '思考', '嫌弃', '开摆', 'wink']

export interface StaticImage {
  id: string
  label: string
  url: string
}

export const STATIC_IMAGES: StaticImage[] = Object.entries(imageModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, url], index) => {
    const file = path.split('/').pop() ?? ''
    return {
      id: file.replace(/\.png$/i, ''),
      label: LABELS[index] ?? `形象 ${index + 1}`,
      url,
    }
  })

export const DEFAULT_IMAGE =
  STATIC_IMAGES.find((image) => image.id === DEFAULT_IMAGE_ID) ?? STATIC_IMAGES[0]
