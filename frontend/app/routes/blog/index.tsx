import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/index";
import { getApiUrl } from "~/lib/utils";

interface BlogPostPreview {
  slug: string;
  title: string;
  author: string;
  date: string;
  summary: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const res = await fetch(`${getApiUrl(request)}/api/blog`);
  if (!res.ok) {
    throw new Response("Failed to load blog posts", { status: res.status });
  }
  const data = await res.json() as { posts: BlogPostPreview[] };
  return { posts: data.posts };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Blog | Mafia Arena" },
    { name: "description", content: "Articles about AI benchmarking and Mafia Arena" },
  ];
}

export default function BlogIndex() {
  const { posts } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-3xl pb-12">
      <h1 className="text-4xl font-display font-bold mb-2 text-foreground">Blog</h1>
      <p className="text-muted-foreground mb-10">
        Nobody reads this stuff, but here's a list of blog posts.
      </p>

      <div className="space-y-8">
        {posts.map((post) => (
          <article key={post.slug} className="group">
            <Link to={`/blog/${post.slug}`} className="block">
              <h2 className="text-xl font-display font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
                {post.title}
              </h2>
              <p className="text-muted-foreground mb-2 leading-relaxed">
                {post.summary}
              </p>
              <div className="text-sm text-muted-foreground/70">
                <span>{post.author}</span>
                <span className="mx-2">·</span>
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </div>
            </Link>
          </article>
        ))}
      </div>

      {posts.length === 0 && (
        <p className="text-muted-foreground">No posts yet. Check back soon!</p>
      )}
    </div>
  );
}
