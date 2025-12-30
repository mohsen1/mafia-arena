import type { Route } from "./+types/faq";
import { MarkdownText } from "~/components/ui/MarkdownText";
import faqContent from "../../../FAQ.md?raw";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "FAQ | Mafia Arena" },
    { name: "description", content: "Frequently asked questions about Mafia Arena" },
  ];
}

export default function FAQ() {
  return (
    <div className="max-w-3xl pb-12">
      <MarkdownText content={faqContent} variant="prose" />
    </div>
  );
}
