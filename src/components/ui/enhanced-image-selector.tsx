/**
 * Enhanced Image Selector Component
 *
 * Provides a better UX for character image selection with:
 * - Categorization by gender and age
 * - Image previews with descriptions
 * - Search and filter functionality
 * - Better visual organization
 */

'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Search, User, X, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ImageData {
  path: string;
  category: {
    gender: 'male' | 'female' | 'neutral';
    age: 'young' | 'old' | 'timeless';
    style?: string;
  };
  description: string;
  tags: string[];
}

// Mock data structure for better image organization
// In production, this would come from your image management system
const ORGANIZED_IMAGES: ImageData[] = [
  // Special
  {
    path: '/images/characters/mod.png',
    category: { gender: 'neutral', age: 'timeless', style: 'moderator' },
    description: 'Mysterious moderator figure',
    tags: ['moderator', 'special', 'mysterious', 'authority'],
  },
  // Female Young
  {
    path: '/images/characters/female/young/unnamed.png',
    category: { gender: 'female', age: 'young', style: 'casual' },
    description: 'Young woman with casual style',
    tags: ['casual', 'friendly', 'approachable'],
  },
  {
    path: '/images/characters/female/young/unnamed-1.png',
    category: { gender: 'female', age: 'young', style: 'elegant' },
    description: 'Young woman with elegant appearance',
    tags: ['elegant', 'sophisticated', 'professional'],
  },
  {
    path: '/images/characters/female/young/unnamed-3.png',
    category: { gender: 'female', age: 'young', style: 'artistic' },
    description: 'Young woman with artistic flair',
    tags: ['artistic', 'creative', 'bohemian'],
  },
  // Female Old
  {
    path: '/images/characters/female/old/unnamed-2.png',
    category: { gender: 'female', age: 'old', style: 'wise' },
    description: 'Elderly woman with wise appearance',
    tags: ['wise', 'experienced', 'maternal'],
  },
  {
    path: '/images/characters/female/old/unnamed-3.png',
    category: { gender: 'female', age: 'old', style: 'regal' },
    description: 'Elderly woman with regal bearing',
    tags: ['regal', 'distinguished', 'noble'],
  },
  // Male Young
  {
    path: '/images/characters/male/young/unnamed.png',
    category: { gender: 'male', age: 'young', style: 'confident' },
    description: 'Young man with confident demeanor',
    tags: ['confident', 'charismatic', 'leader'],
  },
  {
    path: '/images/characters/male/young/unnamed-1.png',
    category: { gender: 'male', age: 'young', style: 'scholarly' },
    description: 'Young man with scholarly appearance',
    tags: ['scholarly', 'intellectual', 'studious'],
  },
  // Male Old
  {
    path: '/images/characters/male/old/unnamed.png',
    category: { gender: 'male', age: 'old', style: 'distinguished' },
    description: 'Elderly man with distinguished look',
    tags: ['distinguished', 'respected', 'authoritative'],
  },
  {
    path: '/images/characters/male/old/unnamed-0.png',
    category: { gender: 'male', age: 'old', style: 'mysterious' },
    description: 'Elderly man with mysterious aura',
    tags: ['mysterious', 'enigmatic', 'secretive'],
  },
];

interface EnhancedImageSelectorProps {
  selectedImage: string | null;
  onImageSelect: (imagePath: string | null) => void;
  triggerClassName?: string;
  triggerContent?: React.ReactNode;
}

export function EnhancedImageSelector({
  selectedImage,
  onImageSelect,
  triggerClassName,
  triggerContent,
}: EnhancedImageSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'all' | 'male' | 'female'>(
    'all'
  );
  const [selectedAge, setSelectedAge] = useState<'all' | 'young' | 'old'>(
    'all'
  );
  const [previewImage, setPreviewImage] = useState<ImageData | null>(null);

  // Filter images based on current filters
  const filteredImages = useMemo(() => {
    return ORGANIZED_IMAGES.filter((image) => {
      // Gender filter
      if (selectedTab !== 'all' && image.category.gender !== selectedTab) {
        return false;
      }

      // Age filter
      if (selectedAge !== 'all' && image.category.age !== selectedAge) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          image.description.toLowerCase().includes(query) ||
          image.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          image.category.style?.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [selectedTab, selectedAge, searchQuery]);

  const handleImageSelect = useCallback(
    (imagePath: string | null) => {
      onImageSelect(imagePath);
      setIsOpen(false);
      setPreviewImage(null);
    },
    [onImageSelect]
  );

  const handleImagePreview = useCallback(
    (image: ImageData) => {
      setPreviewImage(previewImage?.path === image.path ? null : image);
    },
    [previewImage]
  );

  const handleClearSelection = useCallback(() => {
    handleImageSelect(null);
  }, [handleImageSelect]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {triggerContent || (
          <Button
            variant="outline"
            size="icon"
            className={cn(
              'w-8 h-8 rounded-full border-2 border-background bg-muted hover:bg-muted/80',
              triggerClassName
            )}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-4xl h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('imageSelector.chooseCharacterImage')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-full">
          {/* Search and Filters */}
          <div className="space-y-4 pb-4 border-b">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('imageSelector.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filter Button Groups */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Gender Filter */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">
                  {t('imageSelector.gender')}
                </label>
                <div className="flex border rounded-md">
                  <Button
                    type="button"
                    variant={selectedTab === 'all' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1 rounded-none border-0 rounded-l-md"
                    onClick={() => setSelectedTab('all')}
                  >
                    {t('imageSelector.all')}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedTab === 'male' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1 rounded-none border-0"
                    onClick={() => setSelectedTab('male')}
                  >
                    {t('imageSelector.male')}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedTab === 'female' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1 rounded-none border-0 rounded-r-md"
                    onClick={() => setSelectedTab('female')}
                  >
                    {t('imageSelector.female')}
                  </Button>
                </div>
              </div>

              {/* Age Filter */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">
                  {t('imageSelector.age')}
                </label>
                <div className="flex border rounded-md">
                  <Button
                    type="button"
                    variant={selectedAge === 'all' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1 rounded-none border-0 rounded-l-md"
                    onClick={() => setSelectedAge('all')}
                  >
                    {t('imageSelector.all')}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedAge === 'young' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1 rounded-none border-0"
                    onClick={() => setSelectedAge('young')}
                  >
                    {t('imageSelector.young')}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedAge === 'old' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1 rounded-none border-0 rounded-r-md"
                    onClick={() => setSelectedAge('old')}
                  >
                    {t('imageSelector.older')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Image Grid */}
          <div className="flex-1 overflow-y-auto pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {/* Clear Selection Option */}
              <Card
                className={cn(
                  'cursor-pointer transition-all hover:scale-105',
                  !selectedImage
                    ? 'ring-2 ring-primary'
                    : 'hover:ring-1 hover:ring-muted-foreground'
                )}
                onClick={handleClearSelection}
              >
                <CardContent className="p-3 flex flex-col items-center justify-center h-32">
                  <X className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-xs text-center text-muted-foreground">
                    {t('imageSelector.noImage')}
                  </span>
                </CardContent>
              </Card>

              {/* Image Options */}
              {filteredImages.map((image) => (
                <Card
                  key={image.path}
                  className={cn(
                    'cursor-pointer transition-all hover:scale-105 relative',
                    selectedImage === image.path
                      ? 'ring-2 ring-primary'
                      : 'hover:ring-1 hover:ring-muted-foreground',
                    previewImage?.path === image.path && 'ring-2 ring-blue-500'
                  )}
                  onClick={() => handleImageSelect(image.path)}
                  onMouseEnter={() => handleImagePreview(image)}
                  onMouseLeave={() => setPreviewImage(null)}
                >
                  <CardContent className="p-2">
                    <div className="relative">
                      <Image
                        src={image.path}
                        alt={image.description}
                        width={80}
                        height={80}
                        className="w-full h-20 object-cover rounded-md"
                      />

                      {/* Style Badge */}
                      {image.category.style && (
                        <Badge
                          variant="secondary"
                          className="absolute top-1 right-1 text-xs px-1 py-0"
                        >
                          {image.category.style}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        <Badge
                          variant={
                            image.category.gender === 'male'
                              ? 'default'
                              : image.category.gender === 'female'
                              ? 'secondary'
                              : 'destructive'
                          }
                          className="text-xs px-1"
                        >
                          {image.category.gender}
                        </Badge>
                        <Badge variant="outline" className="text-xs px-1">
                          {image.category.age}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground text-center truncate">
                        {image.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredImages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{t('imageSelector.noImagesMatch')}</p>
                <p className="text-sm">{t('imageSelector.tryAdjusting')}</p>
              </div>
            )}
          </div>

          {/* Preview Panel */}
          {previewImage && (
            <div className="border-t pt-4 mt-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <Image
                      src={previewImage.path}
                      alt={previewImage.description}
                      width={60}
                      height={60}
                      className="rounded-md object-cover"
                    />
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">
                        {previewImage.description}
                      </h4>
                      <div className="flex gap-1 mt-1 mb-2">
                        {previewImage.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('imageSelector.clickToSelect')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
