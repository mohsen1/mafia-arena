'use client';

import { useState, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from '@/lib/i18n/settings';
import { Loader2, Settings2, UserPlus, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import {
  CharacterSlotItem,
  CharacterSlotMobile,
} from '@/components/character-slot/CharacterSlotItem';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGameConfig, type ConfigCharacterSlot } from '@/hooks/useGameConfig';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { mapLanguageCodeToLongCode } from '@/lib/i18n/settings';
import React, { useMemo, useCallback } from 'react';

interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const availableRolesForSelection: RoleName[] = [
  RoleName.Villager,
  RoleName.Mafia,
  RoleName.Seer,
  RoleName.Doctor,
];

const CharacterSlotList = React.memo(function CharacterSlotList({
  characterSlots,
  availableRoles,
  isSubmitting,
  onUpdateRole,
  onUpdateProviderAndModel,
  onRemove,
  onUpdateName,
  onUpdateImageUrl,
}: {
  characterSlots: ConfigCharacterSlot[];
  availableRoles: RoleName[];
  isSubmitting: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  onUpdateProviderAndModel: (
    clientId: string,
    provider: string,
    newModel: string
  ) => void;
  onRemove: (clientId: string) => void;
  onUpdateName: (clientId: string, newName: string) => void;
  onUpdateImageUrl: (clientId: string, newImageUrl: string | null) => void;
}) {
  const { t } = useTranslation();

  const canRemove = useMemo(
    () => characterSlots.length > 5,
    [characterSlots.length]
  );

  return (
    <>
      {/* Desktop Table Layout */}
      <Table className="pe-2 hidden md:table">
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="w-[150px]">
              {t('TableHeader_Character', 'Character')}
            </TableHead>
            <TableHead>{t('TableHeader_Role', 'Role')}</TableHead>
            <TableHead>{t('TableHeader_Provider', 'AI Provider')}</TableHead>
            <TableHead>{t('TableHeader_Model', 'AI Model')}</TableHead>
            <TableHead className="text-right">
              {t('TableHeader_Actions', 'Actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {characterSlots.map((slot, index) => (
            <CharacterSlotItem
              key={slot.clientId}
              slot={slot}
              index={index}
              isHuman={slot.isHuman ?? false}
              availableRoles={availableRoles}
              isSubmitting={isSubmitting}
              canRemove={canRemove}
              onUpdateRole={onUpdateRole}
              onUpdateProviderAndModel={onUpdateProviderAndModel}
              onRemove={onRemove}
              onUpdateName={onUpdateName}
              onUpdateImageUrl={onUpdateImageUrl}
            />
          ))}
        </TableBody>
      </Table>

      {/* Mobile Layout */}
      <div className="block md:hidden space-y-0">
        {characterSlots.map((slot, index) => (
          <CharacterSlotMobile
            key={slot.clientId}
            slot={slot}
            index={index}
            isHuman={slot.isHuman ?? false}
            availableRoles={availableRoles}
            isSubmitting={isSubmitting}
            canRemove={canRemove}
            onUpdateRole={onUpdateRole}
            onUpdateProviderAndModel={onUpdateProviderAndModel}
            onRemove={onRemove}
            onUpdateName={onUpdateName}
            onUpdateImageUrl={onUpdateImageUrl}
          />
        ))}
      </div>
    </>
  );
});

function CharacterSetupContent({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const router = useRouter();

  // Get config from URL params or localStorage for persistence
  const [useSeparateAIModelForMafia] = useState(false);
  const [mafiaProviderSelection] = useState<string>('');
  const [mafiaModelSelection] = useState<string>('');

  const {
    characterSlots,
    isSubmitting,
    errorMsg,
    initialSlotsSet,
    configValidation,
    totalSlots,
    availableProviders,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotProviderAndModel,
    updateSlotRole,
    updateSlotName,
    updateSlotImageUrl,
  } = useGameConfig(
    lang,
    useSeparateAIModelForMafia,
    mafiaProviderSelection,
    mafiaModelSelection,
    session?.user
  );

  const numberFormatter = useMemo(() => {
    const longCode = mapLanguageCodeToLongCode(lang);
    try {
      return new Intl.NumberFormat(longCode);
    } catch (e) {
      console.error('Failed to create NumberFormat for locale:', longCode, e);
      return new Intl.NumberFormat('en-US');
    }
  }, [lang]);

  const handleSaveAndContinue = useCallback(() => {
    // Save character configuration to localStorage or URL params
    const configData = {
      characterSlots,
      useSeparateAIModelForMafia,
      mafiaProviderSelection,
      mafiaModelSelection,
    };
    localStorage.setItem('characterSetupConfig', JSON.stringify(configData));

    // Navigate back to new game page
    router.push(`/${lang}/new`);
  }, [
    characterSlots,
    useSeparateAIModelForMafia,
    mafiaProviderSelection,
    mafiaModelSelection,
    lang,
    router,
  ]);

  if (errorMsg) {
    return (
      <div className="text-red-500 p-4">
        {t('ErrorPrefix', 'Error')}: {t(errorMsg, errorMsg)}
      </div>
    );
  }

  return (
    <main className="mx-auto p-4 max-w-6xl space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link href={`/${lang}/new`}>
              <ArrowLeft className="w-4 h-4 me-2" />
              {t('common.back', 'Back')}
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">
            {t('CharacterSetupTitle', 'Character Setup')}
          </h1>
        </div>

        <Button
          onClick={handleSaveAndContinue}
          disabled={!configValidation.isValid}
          size="lg"
        >
          {t('SaveAndContinue', 'Save & Continue')}
        </Button>
      </div>

      <div className="md:my-4 md:p-4 rounded-md min-h-[200px]">
        <h3 className="text-lg font-medium text-foreground mb-3 text-center flex items-center justify-center gap-2">
          <Settings2 className="h-5 w-5" />
          {t(
            'DetailedCharacterConfiguration',
            'Detailed Character Configuration'
          )}
        </h3>

        {!initialSlotsSet && availableProviders.length > 0 && (
          <div className="flex justify-center items-center h-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            {t('LoadingSetupLabel', 'Loading setup...')}
          </div>
        )}

        {!initialSlotsSet && availableProviders.length === 0 && (
          <p className="text-center text-sm text-warning">
            {t(
              'WaitingForProvidersLabel',
              'Waiting for available AI providers...'
            )}
          </p>
        )}

        {/* Player Count Adjustment */}
        <div className="mb-4 flex items-center justify-center gap-4">
          <Label className="text-sm font-medium text-muted-foreground">
            {t('PlayersLabel', 'Players')}:
          </Label>
          <span className="text-lg font-semibold text-foreground w-10 text-center">
            {numberFormatter.format(totalSlots)}
          </span>
          <Button
            type="button"
            variant="ghost"
            onClick={addPlayerSlot}
            disabled={isSubmitting}
            aria-label={t('AddPlayerSlotLabel', 'Add player slot')}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            <span>{t('AddPlayerButtonLabel', 'Add')}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              totalSlots > 0 &&
              removePlayerSlot(
                characterSlots[characterSlots.length - 1].clientId
              )
            }
            disabled={isSubmitting || totalSlots <= 5}
            aria-label={t('RemovePlayerSlotLabel', 'Remove last player slot')}
          >
            <Trash2 className="h-4 w-4 mr-1 text-red-500" />
            <span className="text-red-500">
              {t('RemovePlayerButtonLabel', 'Remove')}
            </span>
          </Button>
        </div>

        {initialSlotsSet && characterSlots.length > 0 && (
          <CharacterSlotList
            characterSlots={characterSlots}
            availableRoles={availableRolesForSelection}
            isSubmitting={isSubmitting}
            onUpdateRole={updateSlotRole}
            onUpdateProviderAndModel={updateSlotProviderAndModel}
            onRemove={removePlayerSlot}
            onUpdateName={updateSlotName}
            onUpdateImageUrl={updateSlotImageUrl}
          />
        )}

        {initialSlotsSet && characterSlots.length === 0 && (
          <p className="text-center text-sm text-muted-foreground italic py-4">
            {t(
              'AddPlayerSlotsPrompt',
              "Use the '+' button to add player slots (minimum 5)."
            )}
          </p>
        )}
      </div>
    </main>
  );
}

function UnauthenticatedView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh] space-y-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 text-foreground">
          {t('auth.authenticationRequired')}
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          {t('auth.authRequiredDescription')}
        </p>
        <Button asChild size="lg">
          <Link href={`/${lang}/auth/signin`}>
            {t('auth.signInToContinue')}
          </Link>
        </Button>
      </div>
    </main>
  );
}

function LoadingView() {
  return (
    <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-lg text-muted-foreground">Loading...</p>
      </div>
    </main>
  );
}

export default function CharacterSetupPage({
  params: paramsPromise,
}: PageProps) {
  const params = use(paramsPromise) as { lang: LanguageCode };
  const { lang } = params;
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background">
        <Header currentLang={lang} />
        <LoadingView />
        <Footer currentLang={lang} />
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return (
      <div className="min-h-screen bg-background">
        <Header currentLang={lang} />
        <UnauthenticatedView lang={lang} />
        <Footer currentLang={lang} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />
      <CharacterSetupContent lang={lang} />
      <Footer currentLang={lang} />
    </div>
  );
}
