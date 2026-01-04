import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/$id";
import { getApiUrl } from "~/lib/utils";
import { MarkdownText } from "~/components/ui/MarkdownText";

interface BlogPost {
  slug: string;
  title: string;
  author: string;
  date: string;
  summary: string;
  content: string;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const res = await fetch(`${getApiUrl(request)}/api/blog/${params.id}`);
  if (!res.ok) {
    throw new Response("Blog post not found", { status: 404 });
  }

  const data = await res.json() as { post: BlogPost };
  return { post: data.post };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.post) {
    return [{ title: "Post Not Found | Mafia Arena" }];
  }

  return [
    { title: `${data.post.title} | Mafia Arena` },
    { name: "description", content: data.post.summary },
  ];
}

export default function BlogPost() {
  const { post } = useLoaderData<typeof loader>();

  return (
    <article className="max-w-3xl pb-12">
      <Link
        to="/blog"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block"
      >
        ← Back to Blog
      </Link>

      <header className="mb-10">
        <h1 className="text-4xl font-display font-bold mb-4 text-foreground leading-tight">
          {post.title}
        </h1>
        <div className="text-muted-foreground">
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
      </header>

      <MarkdownText content={post.content} variant="prose" />
    </article>
  );
}


