'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Key,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Save,
  X,
  AlertCircle,
  Sparkles,
  Bot,
  Zap,
  Brain,
  Cpu,
  Calendar,
} from 'lucide-react';
import {
  getUserApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  testApiKey,
  type UserApiKeyInfo,
  type CreateApiKeyData,
} from '@/app/actions/api-keys.actions';
import { availableProviders } from '@/lib/models';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';

interface UserApiKeyManagerProps {
  onKeysChanged?: () => void;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  openai: <Bot className="w-5 h-5" />,
  anthropic: <Brain className="w-5 h-5" />,
  gemini: <Sparkles className="w-5 h-5" />,
  groq: <Zap className="w-5 h-5" />,
  fireworks: <Cpu className="w-5 h-5" />,
};

const PROVIDER_COLORS: Record<string, string> = {
  openai:
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  anthropic:
    'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  gemini: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  groq: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  fireworks: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
};

export function UserApiKeyManager({ onKeysChanged }: UserApiKeyManagerProps) {
  const { t } = useTranslation();
  const [apiKeys, setApiKeys] = useState<UserApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);

  // Form state for adding/editing keys
  const [formData, setFormData] = useState({
    provider: '',
    keyName: '',
    apiKey: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load user's API keys on component mount
  useEffect(() => {
    loadApiKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const keys = await getUserApiKeys();
      setApiKeys(keys);
      setError(null);
    } catch (err) {
      setError(t('apiKeys.failedToLoad'));
      console.error('Error loading API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async () => {
    setFormErrors({});

    // Validate form
    const errors: Record<string, string> = {};
    if (!formData.provider) errors.provider = t('apiKeys.providerRequired');
    if (!formData.keyName.trim()) errors.keyName = t('apiKeys.keyNameRequired');
    if (!formData.apiKey.trim()) errors.apiKey = t('apiKeys.apiKeyRequired');

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      setSubmitting(true);
      const result = await createApiKey(formData as CreateApiKeyData);

      if (result.success) {
        setShowAddForm(false);
        resetForm();
        await loadApiKeys();
        onKeysChanged?.();
      } else {
        setFormErrors({ general: result.error || t('apiKeys.failedToAdd') });
      }
    } catch (err) {
      setFormErrors({ general: t('apiKeys.failedToAdd') });
      console.error('Error adding API key:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditKey = async (keyId: string) => {
    setFormErrors({});

    const errors: Record<string, string> = {};
    if (!formData.keyName.trim()) errors.keyName = t('apiKeys.keyNameRequired');
    if (formData.apiKey.trim() && formData.apiKey.length < 10) {
      errors.apiKey = t('apiKeys.apiKeyTooShort');
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      setSubmitting(true);
      const updateData: {
        id: string;
        keyName: string;
        apiKey?: string;
      } = {
        id: keyId,
        keyName: formData.keyName,
      };

      if (formData.apiKey.trim()) {
        updateData.apiKey = formData.apiKey;
      }

      const result = await updateApiKey(updateData);

      if (result.success) {
        setEditingKeyId(null);
        resetForm();
        await loadApiKeys();
        onKeysChanged?.();
      } else {
        setFormErrors({ general: result.error || t('apiKeys.failedToUpdate') });
      }
    } catch (err) {
      setFormErrors({ general: t('apiKeys.failedToUpdate') });
      console.error('Error updating API key:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm(t('apiKeys.deleteConfirmation'))) {
      return;
    }

    try {
      const result = await deleteApiKey(keyId);

      if (result.success) {
        await loadApiKeys();
        onKeysChanged?.();
      } else {
        alert(result.error || t('apiKeys.failedToDelete'));
      }
    } catch (err) {
      alert(t('apiKeys.failedToDelete'));
      console.error('Error deleting API key:', err);
    }
  };

  const startEditing = (key: UserApiKeyInfo) => {
    setEditingKeyId(key.id);
    setFormData({
      provider: key.provider,
      keyName: key.keyName,
      apiKey: '', // Don't pre-fill the API key for security
    });
    setFormErrors({});
    setShowAddForm(false);
  };

  const cancelEditing = () => {
    setEditingKeyId(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ provider: '', keyName: '', apiKey: '' });
    setFormErrors({});
    setShowApiKey(false);
    setTestResult(null);
  };

  const handleTestApiKey = async () => {
    if (!formData.provider || !formData.apiKey.trim()) {
      setTestResult({
        success: false,
        message: t('apiKeys.enterProviderAndKey'),
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const result = await testApiKey(formData.provider, formData.apiKey);
      setTestResult({
        success: result.success,
        message: result.success
          ? t('apiKeys.testSuccess')
          : result.error || t('apiKeys.testFailed'),
      });
    } catch {
      setTestResult({
        success: false,
        message: t('apiKeys.testFailed'),
      });
    } finally {
      setTesting(false);
    }
  };

  const startAdding = () => {
    setShowAddForm(true);
    setEditingKeyId(null);
    resetForm();
  };

  const cancelAdding = () => {
    setShowAddForm(false);
    resetForm();
  };

  // Get available providers for the dropdown
  const getAvailableProvidersForDropdown = () => {
    return availableProviders.map((provider) => ({
      value: provider.value,
      label: t(`apiKeys.providers.${provider.value}`) || provider.title,
    }));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Skeleton for API key items */}
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-48" />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Key className="w-5 h-5" />
            {t('apiKeys.yourApiKeys')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('apiKeys.manageDescription')}
          </p>
        </div>
        {!showAddForm && !editingKeyId && (
          <Button onClick={startAdding}>
            <Plus className="w-4 h-4 me-2" />
            {t('apiKeys.addApiKey')}
          </Button>
        )}
      </div>

      {error && (
        <Alert>
          <XCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Add Form */}
      {showAddForm && (
        <Card className="border-0 shadow-none bg-secondary/30">
          <CardHeader>
            <CardTitle className="text-lg">
              {t('apiKeys.addNewApiKey')}
            </CardTitle>
            <CardDescription>
              {t('apiKeys.addNewApiKeyDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formErrors.general && (
              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>{formErrors.general}</AlertDescription>
              </Alert>
            )}

            <div>
              <Label htmlFor="provider">{t('apiKeys.provider')}</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, provider: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('apiKeys.selectProvider')} />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableProvidersForDropdown().map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.provider && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.provider}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="keyName">{t('apiKeys.keyName')}</Label>
              <Input
                id="keyName"
                placeholder={t('apiKeys.keyNamePlaceholder')}
                value={formData.keyName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, keyName: e.target.value }))
                }
              />
              {formErrors.keyName && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.keyName}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="apiKey">{t('apiKeys.apiKey')}</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={t('apiKeys.apiKeyPlaceholder')}
                  value={formData.apiKey}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, apiKey: e.target.value }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute end-2 top-1/2 -translate-y-1/2 h-auto p-1"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {formErrors.apiKey && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.apiKey}
                </p>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleTestApiKey}
                disabled={
                  testing || !formData.provider || !formData.apiKey.trim()
                }
                className="mt-2"
              >
                {testing ? (
                  <>
                    <AlertCircle className="w-4 h-4 me-2 animate-spin" />
                    {t('apiKeys.testing')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 me-2" />
                    {t('apiKeys.testConnection')}
                  </>
                )}
              </Button>
              {testResult && (
                <Alert
                  className={`mt-2 ${testResult.success ? 'border-green-500' : ''}`}
                >
                  {testResult.success ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <AlertDescription>{testResult.message}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAddKey} disabled={submitting}>
                <Save className="w-4 h-4 me-2" />
                {submitting ? t('apiKeys.adding') : t('apiKeys.addKey')}
              </Button>
              <Button
                variant="outline"
                onClick={cancelAdding}
                disabled={submitting}
              >
                <X className="w-4 h-4 me-2" />
                {t('apiKeys.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Keys List */}
      {apiKeys.length === 0 && !showAddForm ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Key className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {t('apiKeys.noKeysConfigured')}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              {t('apiKeys.noKeysDescription')}
            </p>
            <Button onClick={startAdding} variant="default">
              <Plus className="w-4 h-4 me-2" />
              {t('apiKeys.addFirstKey', 'Add your first API key')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div key={key.id}>
              {editingKeyId === key.id ? (
                // Edit Form
                <Card className="border-0 shadow-none bg-secondary/30">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {t('apiKeys.editApiKey')}
                    </CardTitle>
                    <CardDescription>
                      {t('apiKeys.editApiKeyDescription')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {formErrors.general && (
                      <Alert>
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>
                          {formErrors.general}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div>
                      <Label htmlFor="editProvider">
                        {t('apiKeys.provider')}
                      </Label>
                      <Input
                        id="editProvider"
                        value={
                          t(`apiKeys.providers.${formData.provider}`) ||
                          formData.provider
                        }
                        disabled
                      />
                    </div>

                    <div>
                      <Label htmlFor="editKeyName">
                        {t('apiKeys.keyName')}
                      </Label>
                      <Input
                        id="editKeyName"
                        value={formData.keyName}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            keyName: e.target.value,
                          }))
                        }
                      />
                      {formErrors.keyName && (
                        <p className="text-sm text-destructive mt-1">
                          {formErrors.keyName}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="editApiKey">
                        {t('apiKeys.newApiKey')}
                      </Label>
                      <div className="relative">
                        <Input
                          id="editApiKey"
                          type={showApiKey ? 'text' : 'password'}
                          placeholder={t('apiKeys.newApiKeyPlaceholder')}
                          value={formData.apiKey}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              apiKey: e.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute end-2 top-1/2 -translate-y-1/2 h-auto p-1"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      {formErrors.apiKey && (
                        <p className="text-sm text-destructive mt-1">
                          {formErrors.apiKey}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleEditKey(key.id)}
                        disabled={submitting}
                      >
                        <Save className="w-4 h-4 me-2" />
                        {submitting
                          ? t('apiKeys.updating')
                          : t('apiKeys.updateKey')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={cancelEditing}
                        disabled={submitting}
                      >
                        <X className="w-4 h-4 me-2" />
                        {t('apiKeys.cancel')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                // Display Mode - Improved layout
                <Card className="overflow-hidden transition-all hover:shadow-md">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left side - Key info */}
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        {/* Provider Icon */}
                        <div
                          className={`p-2.5 rounded-lg ${PROVIDER_COLORS[key.provider] || 'bg-gray-100 dark:bg-gray-800'}`}
                        >
                          {PROVIDER_ICONS[key.provider] || (
                            <Key className="w-5 h-5" />
                          )}
                        </div>

                        {/* Key Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="font-semibold text-foreground truncate">
                              {key.keyName}
                            </h4>
                            <Badge
                              variant="outline"
                              className={`${PROVIDER_COLORS[key.provider] || 'border-gray-300'}`}
                            >
                              {t(`apiKeys.providers.${key.provider}`) ||
                                key.provider}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {t('apiKeys.added')}{' '}
                              {new Date(key.createdAt).toLocaleDateString()}
                            </span>
                            {key.isActive ? (
                              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <CheckCircle className="w-3 h-3" />
                                {t('apiKeys.active', 'Active')}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-gray-500">
                                <XCircle className="w-3 h-3" />
                                {t('apiKeys.inactive', 'Inactive')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side - Actions */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(key)}
                          disabled={showAddForm}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span className="sr-only">{t('apiKeys.edit')}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteKey(key.id)}
                          disabled={showAddForm || editingKeyId !== null}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="sr-only">{t('apiKeys.delete')}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
