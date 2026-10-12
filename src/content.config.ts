import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    category: z.enum(['tech', 'essay', 'travel', 'project']).default('tech'),
    tags: z.array(z.string()).default([]),
    heroImage: z.string().optional(),
    featured: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['ai', 'tool', 'system', 'web']).default('tool'),
    status: z.enum(['active', 'shipped', 'experiment']).default('active'),
    tags: z.array(z.string()).default([]),
    github: z.string().optional(),
    demo: z.string().optional(),
    featured: z.boolean().default(false),
    pubDate: z.coerce.date().optional(),
  }),
});

const gallery = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/gallery' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    category: z.enum(['travel', 'film', 'video', 'life']).default('travel'),
    type: z.enum(['image', 'video']).default('image'),
    mediaUrl: z.string(),
    thumbnailUrl: z.string().optional(),
    location: z.string().optional(),
    camera: z.string().optional(),
    aspectRatio: z.string().default('4/3'),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { posts, projects, gallery };
