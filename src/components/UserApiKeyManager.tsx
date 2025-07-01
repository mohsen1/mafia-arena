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
} from 'lucide-react';
import {
  getUserApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  type UserApiKeyInfo,
  type CreateApiKeyData,
} from '@/app/actions/api-keys.actions';
import { availableProviders } from '@/lib/models';

interface UserApiKeyManagerProps {
  onKeysChanged?: () => void;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
  groq: 'Groq',
  fireworks: 'Fireworks AI',
};

export function UserApiKeyManager({ onKeysChanged }: UserApiKeyManagerProps) {
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

  // Load user's API keys on component mount
  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const keys = await getUserApiKeys();
      setApiKeys(keys);
      setError(null);
    } catch (err) {
      setError('Failed to load API keys');
      console.error('Error loading API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async () => {
    setFormErrors({});

    // Validate form
    const errors: Record<string, string> = {};
    if (!formData.provider) errors.provider = 'Please select a provider';
    if (!formData.keyName.trim())
      errors.keyName = 'Please enter a name for your key';
    if (!formData.apiKey.trim()) errors.apiKey = 'Please enter your API key';

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
        setFormErrors({ general: result.error || 'Failed to add API key' });
      }
    } catch (err) {
      setFormErrors({ general: 'Failed to add API key' });
      console.error('Error adding API key:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditKey = async (keyId: string) => {
    setFormErrors({});

    const errors: Record<string, string> = {};
    if (!formData.keyName.trim())
      errors.keyName = 'Please enter a name for your key';
    if (formData.apiKey.trim() && formData.apiKey.length < 10) {
      errors.apiKey = 'API key appears too short';
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
        setFormErrors({ general: result.error || 'Failed to update API key' });
      }
    } catch (err) {
      setFormErrors({ general: 'Failed to update API key' });
      console.error('Error updating API key:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this API key? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      const result = await deleteApiKey(keyId);

      if (result.success) {
        await loadApiKeys();
        onKeysChanged?.();
      } else {
        alert(result.error || 'Failed to delete API key');
      }
    } catch (err) {
      alert('Failed to delete API key');
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
      label: PROVIDER_DISPLAY_NAMES[provider.value] || provider.title,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">Loading...</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Key className="w-5 h-5" />
            Your API Keys
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage your AI provider API keys. These are stored securely and
            encrypted.
          </p>
        </div>
        {!showAddForm && !editingKeyId && (
          <Button onClick={startAdding}>
            <Plus className="w-4 h-4 me-2" />
            Add API Key
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add New API Key</CardTitle>
            <CardDescription>
              Add an API key for an AI provider. Your key will be encrypted and
              stored securely.
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
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, provider: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select AI provider" />
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
              <Label htmlFor="keyName">Key Name</Label>
              <Input
                id="keyName"
                placeholder="e.g., My OpenAI Key"
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
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="Enter your API key"
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
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAddKey} disabled={submitting}>
                <Save className="w-4 h-4 me-2" />
                {submitting ? 'Adding...' : 'Add Key'}
              </Button>
              <Button
                variant="outline"
                onClick={cancelAdding}
                disabled={submitting}
              >
                <X className="w-4 h-4 me-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Keys List */}
      {apiKeys.length === 0 && !showAddForm ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No API keys configured</p>
          <p className="text-sm">Add your first API key to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div key={key.id}>
              {editingKeyId === key.id ? (
                // Edit Form
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Edit API Key</CardTitle>
                    <CardDescription>
                      Update your API key details. Leave the API key field empty
                      to keep the current key.
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
                      <Label htmlFor="editProvider">Provider</Label>
                      <Input
                        id="editProvider"
                        value={
                          PROVIDER_DISPLAY_NAMES[formData.provider] ||
                          formData.provider
                        }
                        disabled
                      />
                    </div>

                    <div>
                      <Label htmlFor="editKeyName">Key Name</Label>
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
                      <Label htmlFor="editApiKey">New API Key (optional)</Label>
                      <div className="relative">
                        <Input
                          id="editApiKey"
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="Enter new API key to replace current one"
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
                        {submitting ? 'Updating...' : 'Update Key'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={cancelEditing}
                        disabled={submitting}
                      >
                        <X className="w-4 h-4 me-2" />
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                // Display Mode
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{key.keyName}</span>
                        <Badge variant={key.isActive ? 'default' : 'secondary'}>
                          {PROVIDER_DISPLAY_NAMES[key.provider] || key.provider}
                        </Badge>
                        {key.isActive ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Added {new Date(key.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(key)}
                      disabled={showAddForm}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteKey(key.id)}
                      disabled={showAddForm || editingKeyId !== null}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
