/**
 * Blog API routes.
 * Super simple: list posts and get individual posts.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';
import { getAllPosts, getPostBySlug } from '../blog/posts.js';
import { Errors } from '../utils/errors.js';

const blog = new Hono<{ Bindings: Env }>();

/**
 * GET /api/blog - List all posts.
 */
blog.get('/', (c) => {
  const posts = getAllPosts();
  return c.json({ posts });
});

/**
 * GET /api/blog/:slug - Get a single post.
 */
blog.get('/:slug', (c) => {
  const slug = c.req.param('slug');
  const post = getPostBySlug(slug);

  if (!post) {
    throw Errors.NotFound('Blog post');
  }

  return c.json({ post });
});

export default blog;

