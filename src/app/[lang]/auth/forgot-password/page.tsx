"use client";

import { use, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Header } from "@/components/Header";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requestPasswordResetAction } from "@/app/actions/auth.actions";
import type { LanguageCode } from "@/lib/i18n/settings";

interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
}

export default function ForgotPasswordPage({
  params: paramsPromise,
}: PageProps) {
  const params = use(paramsPromise);
  const { lang } = params;
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await requestPasswordResetAction(email);
    if (!result.success) {
      setError(result.error || "Failed");
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/${lang}/auth/signin`}>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
              <CardTitle>{t("passwordReset.title")}</CardTitle>
            </div>
            {!sent && (
              <CardDescription>{t("passwordReset.send")}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {sent ? (
              <Alert>
                <AlertDescription>
                  {t("passwordReset.checkEmail")}
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("passwordReset.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("common.loading") : t("passwordReset.send")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
