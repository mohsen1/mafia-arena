'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  X,
  Users,
  Moon,
  Sun,
  Vote,
  Shield,
  Sword,
  Eye,
  Heart,
  CheckCircle,
  Play,
  Trophy,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
  icon: React.ReactNode;
}

interface InteractiveTutorialProps {
  onComplete?: () => void;
  className?: string;
}

export function InteractiveTutorial({ onComplete, className }: InteractiveTutorialProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const tutorialSteps: TutorialStep[] = [
    {
      id: 'welcome',
      title: t('tutorial.welcome.title', 'Welcome to Werewolf AI'),
      description: t('tutorial.welcome.description', 'Learn how to play this classic social deduction game'),
      icon: <HelpCircle className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm">
            {t(
              'tutorial.welcome.content1',
              'Werewolf is a game of deception, deduction, and strategy. Players are secretly assigned roles and must work together (or against each other) to achieve their goals.'
            )}
          </p>
          <p className="text-sm">
            {t(
              'tutorial.welcome.content2',
              'In this AI-powered version, you\'ll play alongside intelligent AI characters, each with unique personalities and strategies.'
            )}
          </p>
          <div className="bg-primary/10 p-4 rounded-lg">
            <p className="text-sm font-medium">
              {t('tutorial.welcome.tip', 'Tip: Pay attention to what players say and how they vote!')}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'roles',
      title: t('tutorial.roles.title', 'Understanding Roles'),
      description: t('tutorial.roles.description', 'Learn about the different roles in the game'),
      icon: <Users className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-500/20 rounded">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-medium text-sm">{t('tutorial.roles.villager', 'Villager')}</h4>
                <p className="text-xs text-muted-foreground">
                  {t('tutorial.roles.villagerDesc', 'Regular townspeople who must identify the werewolves')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-500/20 rounded">
                <Sword className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h4 className="font-medium text-sm">{t('tutorial.roles.werewolf', 'Werewolf')}</h4>
                <p className="text-xs text-muted-foreground">
                  {t('tutorial.roles.werewolfDesc', 'Secret killers who eliminate villagers at night')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-500/20 rounded">
                <Eye className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-medium text-sm">{t('tutorial.roles.seer', 'Seer')}</h4>
                <p className="text-xs text-muted-foreground">
                  {t('tutorial.roles.seerDesc', 'Can investigate one player each night to learn their role')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-500/20 rounded">
                <Heart className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-medium text-sm">{t('tutorial.roles.doctor', 'Doctor')}</h4>
                <p className="text-xs text-muted-foreground">
                  {t('tutorial.roles.doctorDesc', 'Can protect one player from werewolf attacks each night')}
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'day-phase',
      title: t('tutorial.dayPhase.title', 'Day Phase'),
      description: t('tutorial.dayPhase.description', 'What happens during the day'),
      icon: <Sun className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm">
            {t(
              'tutorial.dayPhase.content1',
              'During the day, all players discuss and share their suspicions. This is when you gather information and try to identify the werewolves.'
            )}
          </p>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">{t('tutorial.dayPhase.activities', 'Day Activities:')}</h4>
            <ul className="text-xs space-y-1 ms-4">
              <li>• {t('tutorial.dayPhase.activity1', 'Players discuss who they suspect')}</li>
              <li>• {t('tutorial.dayPhase.activity2', 'Share information from night actions')}</li>
              <li>• {t('tutorial.dayPhase.activity3', 'Build alliances and trust')}</li>
              <li>• {t('tutorial.dayPhase.activity4', 'Vote to eliminate suspected werewolves')}</li>
            </ul>
          </div>

          <Badge variant="secondary" className="text-xs">
            <Vote className="w-3 h-3 mr-1" />
            {t('tutorial.dayPhase.votingTip', 'Majority vote eliminates a player')}
          </Badge>
        </div>
      ),
    },
    {
      id: 'night-phase',
      title: t('tutorial.nightPhase.title', 'Night Phase'),
      description: t('tutorial.nightPhase.description', 'What happens during the night'),
      icon: <Moon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm">
            {t(
              'tutorial.nightPhase.content1',
              'At night, special roles perform their actions in secret. Werewolves choose their victim, while the Doctor and Seer use their abilities.'
            )}
          </p>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">{t('tutorial.nightPhase.actions', 'Night Actions:')}</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Sword className="w-3 h-3 text-red-500" />
                <span>{t('tutorial.nightPhase.werewolfAction', 'Werewolves choose a victim')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-3 h-3 text-green-500" />
                <span>{t('tutorial.nightPhase.doctorAction', 'Doctor protects a player')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-3 h-3 text-purple-500" />
                <span>{t('tutorial.nightPhase.seerAction', 'Seer investigates a player')}</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-500/10 p-3 rounded text-xs">
            {t('tutorial.nightPhase.tip', 'Remember: Regular villagers do nothing at night!')}
          </div>
        </div>
      ),
    },
    {
      id: 'winning',
      title: t('tutorial.winning.title', 'How to Win'),
      description: t('tutorial.winning.description', 'Victory conditions for each team'),
      icon: <Trophy className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="font-medium text-sm">{t('tutorial.winning.townVictory', 'Town Victory')}</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('tutorial.winning.townCondition', 'Eliminate all werewolves to save the village')}
              </p>
            </div>

            <div className="p-3 bg-red-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Sword className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h4 className="font-medium text-sm">{t('tutorial.winning.werewolfVictory', 'Werewolf Victory')}</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('tutorial.winning.werewolfCondition', 'Equal or outnumber the villagers')}
              </p>
            </div>
          </div>

          <div className="text-center pt-2">
            <CheckCircle className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">
              {t('tutorial.winning.ready', 'You\'re ready to play!')}
            </p>
          </div>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    const currentStepId = tutorialSteps[currentStep].id;
    setCompletedSteps((prev) => new Set([...prev, currentStepId]));
    
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsOpen(false);
    onComplete?.();
  };

  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;
  const currentTutorialStep = tutorialSteps[currentStep];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          'fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4',
          className
        )}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-lg"
        >
          <Card className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>

            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  {currentTutorialStep.icon}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">{currentTutorialStep.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {currentTutorialStep.description}
                  </CardDescription>
                </div>
              </div>
              <Progress value={progress} className="h-2" />
            </CardHeader>

            <CardContent className="space-y-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentTutorialStep.content}
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center justify-between pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={currentStep === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  {t('tutorial.previous', 'Previous')}
                </Button>

                <div className="flex gap-1">
                  {tutorialSteps.map((_, index) => (
                    <div
                      key={index}
                      className={cn(
                        'w-2 h-2 rounded-full transition-colors',
                        index === currentStep
                          ? 'bg-primary'
                          : index < currentStep
                          ? 'bg-primary/50'
                          : 'bg-muted'
                      )}
                    />
                  ))}
                </div>

                <Button
                  size="sm"
                  onClick={handleNext}
                  className="min-w-[100px]"
                >
                  {currentStep === tutorialSteps.length - 1 ? (
                    <>
                      <Play className="w-4 h-4 mr-1" />
                      {t('tutorial.start', 'Start Playing')}
                    </>
                  ) : (
                    <>
                      {t('tutorial.next', 'Next')}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
} 