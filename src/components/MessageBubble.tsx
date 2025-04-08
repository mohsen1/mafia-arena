'use client';

import Image from 'next/image';
import { FilteredGameState, ChatMessage } from "@/lib/types/game";
import { useState, useEffect, useRef, useCallback } from 'react';
import { Volume, CheckCircle, Loader2 } from 'lucide-react';
import { useGameContext } from '@/context/GameContext'; // Import context hook
import { Button } from "./ui/button"; // Import Button

// Define the props
interface MessageBubbleProps {
    message: Omit<ChatMessage, 'audience'> & { speakerName: string };
    players: FilteredGameState['players'];
    // latestMessageId: string | null; // Removed prop
}

// Constants
const AUDIO_MIME_TYPE = 'audio/mpeg';

// Message Component with Dark Mode
export function MessageBubble({ message, players }: MessageBubbleProps) {
    const [audioStatus, setAudioStatus] = useState<'idle' | 'loading' | 'playing' | 'done' | 'error'>('idle');
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const mediaSourceRef = useRef<MediaSource | null>(null);
    const sourceBufferRef = useRef<SourceBuffer | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const sourceBufferUpdating = useRef(false);
    const appendQueue = useRef<BufferSource[]>([]);
    const streamEnded = useRef(false);
    const stopReadingRef = useRef(false);
    const cleanupScheduled = useRef(false); // Prevent duplicate cleanup calls

    // Get context functions and state
    const {
        isAutoRunning,
        runNextTurnAction,
        currentlyPlayingMessageId,
        setCurrentlyPlayingMessageId,
        registerStopAudio, // Function to register stop callback
        unregisterStopAudio, // Function to unregister stop callback
        t // Add t function from context
    } = useGameContext();

    const speakerPlayer = message.speaker.type === 'player'
        ? players[message.speaker.playerId]
        : null;
    const isModerator = message.speaker.type === 'moderator';
    const imageUrl = isModerator 
        ? '/images/characters/mod.png' 
        : speakerPlayer?.imageUrl;

    const appendChunk = useCallback(() => {
        if (cleanupScheduled.current || stopReadingRef.current || !sourceBufferRef.current || sourceBufferUpdating.current || appendQueue.current.length === 0 || mediaSourceRef.current?.readyState !== 'open') {
            if(stopReadingRef.current || cleanupScheduled.current) appendQueue.current = []; 
            return; 
        }
        sourceBufferUpdating.current = true;
        try {
            const chunk = appendQueue.current.shift();
            if (chunk) {
                 sourceBufferRef.current.appendBuffer(chunk);
            } else {
                 sourceBufferUpdating.current = false;
            }
        } catch (error: any) {
             console.error("Error appending buffer:", error);
             sourceBufferUpdating.current = false; 
             if (!cleanupScheduled.current) { // Avoid state update if cleanup is happening
                 if (error.name === 'QuotaExceededError') {
                     console.warn("Audio buffer quota exceeded.");
                 } else {
                     setAudioStatus('error');
                 }
             }
        }
    }, []);

    // Function to stop playback and clean up resources
    const stopAndCleanup = useCallback((reason: 'unmount' | 'new_latest' | 'user_stop' | 'error_in_setup' | 'deps_changed' = 'new_latest') => {
        if (cleanupScheduled.current) return; // Already cleaning up
        cleanupScheduled.current = true; // Mark cleanup as started

        stopReadingRef.current = true; 
        console.log(`[Cleanup ${message.messageId}] Reason: ${reason}`); 
        
        // Only abort fetch on explicit user stop
        if (reason === 'user_stop' && abortControllerRef.current) {
            console.log(`[Cleanup ${message.messageId}] Aborting fetch.`); 
            abortControllerRef.current.abort();
        } else {
            console.log(`[Cleanup ${message.messageId}] NOT aborting fetch.`); 
        }

        if (audioRef.current) {
            audioRef.current.pause();
            const currentSrc = audioRef.current.src;
            audioRef.current.removeAttribute('src'); // Remove src instead of setting to empty string
            audioRef.current.load(); // Reset internal state
            if (currentSrc && currentSrc.startsWith('blob:')) {
                URL.revokeObjectURL(currentSrc);
                console.log(`[Cleanup ${message.messageId}] Revoked Object URL: ${currentSrc}`);
            }
        }
        if (mediaSourceRef.current && mediaSourceRef.current.readyState !== 'closed') {
             console.log(`[Cleanup ${message.messageId}] Cleaning MediaSource (readyState: ${mediaSourceRef.current.readyState})`);
            try {
                if (sourceBufferRef.current && mediaSourceRef.current.sourceBuffers.length > 0) {
                    // Only remove if it's actually there and not updating
                    if (!sourceBufferRef.current.updating) {
                         mediaSourceRef.current.removeSourceBuffer(sourceBufferRef.current);
                         console.log(`[Cleanup ${message.messageId}] Removed SourceBuffer`);
                    } else {
                        console.warn(`[Cleanup ${message.messageId}] Could not remove SourceBuffer as it was updating.`);
                        // If it's updating, ending the stream might error, but try anyway? Or just detach?
                    }
                }
                // Only end stream if source is still open (might have closed from removeSourceBuffer)
                 if (mediaSourceRef.current.readyState === 'open') {
                    mediaSourceRef.current.endOfStream();
                     console.log(`[Cleanup ${message.messageId}] Called endOfStream`);
                 }
            } catch (e) {
                console.error(`[Cleanup ${message.messageId}] Error during MediaSource cleanup:`, e);
            }
        }
        
        // Reset refs
        mediaSourceRef.current = null;
        sourceBufferRef.current = null;
        abortControllerRef.current = null;
        appendQueue.current = [];
        streamEnded.current = false;
        sourceBufferUpdating.current = false;
       
        // Reset status
        setAudioStatus('idle'); 
        // Allow cleanup to run again later if needed (e.g., component reused)
         requestAnimationFrame(() => { cleanupScheduled.current = false; }); 

        // Clear global playing state if this message was the one playing
        if (currentlyPlayingMessageId === message.messageId) {
            setCurrentlyPlayingMessageId(null);
             unregisterStopAudio(message.messageId); // Unregister stop function
        }
    }, [message.messageId, currentlyPlayingMessageId, setCurrentlyPlayingMessageId, unregisterStopAudio]);

    const playAudio = useCallback(async () => {
        // Remove the check preventing moderator audio
        // if (isModerator || audioStatus !== 'idle' || !MediaSource || !MediaSource.isTypeSupported(AUDIO_MIME_TYPE)) {
        // Simplify check: only prevent if not idle or MediaSource unsupported
         if (audioStatus !== 'idle' || !MediaSource || !MediaSource.isTypeSupported(AUDIO_MIME_TYPE)) {
           return;
        }
        console.log(`[Play ${message.messageId}] Starting playAudio`);

        // Ensure any previous cleanup flag is reset before starting
        cleanupScheduled.current = false; 
        stopReadingRef.current = false; 
        setAudioStatus('loading');
        streamEnded.current = false;
        appendQueue.current = [];
        const controller = new AbortController();
        abortControllerRef.current = controller; // Store the controller
        const signal = controller.signal;

        let mediaSource: MediaSource | null = null;
        let audioURL: string | null = null;

        try {
            const voiceIdToUse = speakerPlayer?.voiceId || 'default';
            const requestBody = { text: message.content, voice: voiceIdToUse, speakerName: message.speakerName };
            console.log(`[Play ${message.messageId}] Sending fetch...`);

            const response = await fetch('/api/text-to-speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal,
            });
            
             // Check immediately after fetch if aborted during the request
            if (signal.aborted) {
                 console.log(`[Play ${message.messageId}] Fetch aborted immediately after request.`);
                 throw new DOMException('Aborted', 'AbortError'); // Throw standard AbortError
            }

            if (!response.ok || !response.body) {
                 console.error(`[Play ${message.messageId}] Fetch failed: ${response.status} ${response.statusText}`);
                 // Attempt to read error body if possible
                 let errorBody = '';
                 try { errorBody = await response.text(); } catch {} 
                 throw new Error(`Failed to fetch audio stream: ${response.statusText} ${errorBody}`);
            }

            const reader = response.body.getReader();
            mediaSource = new MediaSource();
            mediaSourceRef.current = mediaSource; // Assign to ref
            audioURL = URL.createObjectURL(mediaSource);
            console.log(`[Play ${message.messageId}] Created Object URL: ${audioURL}`);

            // Function to read chunks from the stream
            const readStream = async () => {
                 console.log(`[Stream ${message.messageId}] Starting readStream`);
                try {
                    while (true) {
                        if (signal.aborted || stopReadingRef.current) {
                            console.log(`[Stream ${message.messageId}] Stopping read loop (aborted: ${signal.aborted}, stopped: ${stopReadingRef.current}).`);
                             if (!signal.aborted && reader) { // Release lock if stopped manually
                                 reader.cancel('Stopped manually'); // Cancel the reader
                                 reader.releaseLock();
                             } 
                            break;
                        }
                        
                        const { done, value } = await reader.read();
                        
                        if (signal.aborted || stopReadingRef.current) {
                             console.log(`[Stream ${message.messageId}] Stopping read loop after read (aborted: ${signal.aborted}, stopped: ${stopReadingRef.current}).`);
                             if (!signal.aborted && reader) { // Release lock if stopped manually
                                 if(done) reader.releaseLock(); // Ensure release if done AND stopped
                                 else reader.cancel('Stopped manually');
                             } 
                             break;
                        }

                        if (done) {
                             console.log(`[Stream ${message.messageId}] Finished reading.`);
                            streamEnded.current = true;
                            if (sourceBufferRef.current && !sourceBufferRef.current.updating && mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
                                try {
                                     console.log(`[Stream ${message.messageId}] Calling endOfStream on done.`);
                                    mediaSourceRef.current.endOfStream();
                                } catch (eosError) {
                                     console.error(`[Stream ${message.messageId}] Error ending stream on done:`, eosError);
                                }
                            }
                            break; 
                        }
                        
                        appendQueue.current.push(value);
                        appendChunk();
                    }
                 } catch (error) {
                     if ((error as Error)?.name === 'AbortError') {
                          console.log(`[Stream ${message.messageId}] Reading aborted.`);
                    } else if (!stopReadingRef.current) { 
                          console.error(`[Stream ${message.messageId}] Error reading stream:`, error);
                         if (!cleanupScheduled.current) setAudioStatus('error');
                          if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open' && sourceBufferRef.current && !sourceBufferRef.current.updating) {
                              try { mediaSourceRef.current.endOfStream(); } catch {} 
                          }
                    }
                 } finally {
                    console.log(`[Stream ${message.messageId}] readStream finally block.`);
                     // No explicit releaseLock here - cancellation or done should handle it.
                 }
            };

            if (!audioRef.current) {
                 audioRef.current = new Audio();
                  console.log(`[Play ${message.messageId}] Created new Audio element`);
            }
            audioRef.current.src = audioURL;
             console.log(`[Play ${message.messageId}] Set audio src to ${audioURL}`);
            
            mediaSource.addEventListener('sourceopen', () => {
                 // Check flags again in case cleanup happened between addEventListener and this callback
                 if (signal.aborted || stopReadingRef.current || cleanupScheduled.current) {
                     console.log(`[MSource ${message.messageId}] 'sourceopen' ignored (aborted: ${signal.aborted}, stopped: ${stopReadingRef.current}, cleaned: ${cleanupScheduled.current}).`);
                      // Clean up the URL if we created it but aren't using the MediaSource
                     if (audioURL) URL.revokeObjectURL(audioURL);
                     mediaSourceRef.current = null; // Ensure ref is cleared
                     return;
                 }
                 console.log(`[MSource ${message.messageId}] 'sourceopen' event`);
                try {
                    // Add null check for mediaSource
                    if (!mediaSource) {
                        throw new Error("MediaSource became null unexpectedly during sourceopen");
                    }
                    const buffer = mediaSource.addSourceBuffer(AUDIO_MIME_TYPE);
                    sourceBufferRef.current = buffer; // Assign to ref
                    console.log(`[MSource ${message.messageId}] Added SourceBuffer`);

                    buffer.addEventListener('updateend', () => {
                        sourceBufferUpdating.current = false;
                        if (!stopReadingRef.current && !cleanupScheduled.current) { 
                            if (appendQueue.current.length > 0) {
                                appendChunk();
                            } else if (streamEnded.current && mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
                                 console.log(`[MSource ${message.messageId}] updateend: Stream ended and queue empty, checking endOfStream.`);
                                try {
                                    if (!buffer.updating) {
                                         console.log(`[MSource ${message.messageId}] updateend: Calling endOfStream.`);
                                        mediaSourceRef.current.endOfStream();
                                    }
                                } catch (eosError) {
                                     console.error(`[MSource ${message.messageId}] Error ending stream in updateend:`, eosError);
                                }
                            }
                        }
                    });

                    buffer.addEventListener('error', (ev) => {
                        console.error(`[MSource ${message.messageId}] SourceBuffer error:`, ev);
                        if (!cleanupScheduled.current) setAudioStatus('error');
                    });
                    
                    readStream();

                } catch (e) {
                    console.error(`[MSource ${message.messageId}] Error setting up SourceBuffer:`, e);
                    if (!cleanupScheduled.current) setAudioStatus('error');
                    // Attempt cleanup if source is still open
                    if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
                        try { mediaSourceRef.current.endOfStream(); } catch {}
                    }
                    if (audioURL) URL.revokeObjectURL(audioURL);
                }
            }, { once: true });

             mediaSource.addEventListener('sourceclose', () => {
                 console.log(`[MSource ${message.messageId}] 'sourceclose' event`);
                 // Refs should ideally be cleared by stopAndCleanup
                 // This is more of a notification
             });
             mediaSource.addEventListener('sourceended', () => {
                 console.log(`[MSource ${message.messageId}] 'sourceended' event`);
             });

            // Setup audio element listeners
            const currentAudio = audioRef.current; // Capture current ref value
            const playingHandler = () => {!stopReadingRef.current && !cleanupScheduled.current && setAudioStatus('playing'); console.log(`[Audio ${message.messageId}] playing event`);}
            const endedHandler = () => {!stopReadingRef.current && !cleanupScheduled.current && setAudioStatus('done'); console.log(`[Audio ${message.messageId}] ended event`);}
            const errorHandler = (e: Event | string) => {
                 if (!stopReadingRef.current && !cleanupScheduled.current) { 
                     console.error(`[Audio ${message.messageId}] error event:`, currentAudio?.error, e);
                     setAudioStatus('error');
                 }
            }
            currentAudio.addEventListener('playing', playingHandler);
            currentAudio.addEventListener('ended', endedHandler);
            currentAudio.addEventListener('error', errorHandler);

            // Add cleanup for these specific listeners when stopAndCleanup runs or component unmounts
            // This might be tricky, potentially manage within stopAndCleanup or a separate effect
            
            // Attempt to play
             console.log(`[Play ${message.messageId}] Attempting audio.play()`);
             if (!stopReadingRef.current && !cleanupScheduled.current) { 
                 await currentAudio.play();
                 console.log(`[Play ${message.messageId}] audio.play() promise resolved.`);
             }

        } catch (error) { // Catch errors from fetch, MediaSource setup, or play()
             const err = error as Error;
             console.error(`[Play ${message.messageId}] Error in playAudio setup: ${err.name} - ${err.message}`);
             if (err.name === 'AbortError') {
                 console.log(`[Play ${message.messageId}] Operation aborted.`);
                 // Cleanup should have been called or will be called by effect
                 // Ensure status reflects abortion if not already idle
                 if (audioStatus !== 'idle') {
                     setAudioStatus('idle');
                 }
            } else if (!stopReadingRef.current && !cleanupScheduled.current) { 
                 setAudioStatus('error');
                 // Ensure cleanup runs if an error occurred during setup
                 stopAndCleanup('error_in_setup'); 
             }
             // Revoke URL if it was created and an error occurred
            // Note: stopAndCleanup also attempts revoke, but belt-and-suspenders
             if (audioURL && !(err.name === 'AbortError')) { // Don't revoke if aborted, cleanup handles it
                 URL.revokeObjectURL(audioURL);
             }
        }
    }, [
        isModerator, audioStatus, speakerPlayer, message.content, message.speakerName,
        appendChunk, stopAndCleanup, message.messageId, setCurrentlyPlayingMessageId,
        isAutoRunning, runNextTurnAction, registerStopAudio, unregisterStopAudio, t // Add context dependencies
    ]);

    // Unmount Effect (Keep this for resource cleanup)
     useEffect(() => {       
         return () => {
             console.log(`[Effect Unmount ${message.messageId}] Unmounting.`);
             // Ensure cleanup runs, even if already scheduled, unmount is final.
             // cleanupScheduled.current = false; // Force cleanup allow
             stopAndCleanup('unmount');
         } 
     }, [stopAndCleanup, message.messageId]); 
    
    return (
        <div className={`flex items-start gap-3 p-2 rounded-lg transition-colors duration-200 `}>
            {/* Speaker Image */} 
             <div className="flex-shrink-0 mt-1">
                 {imageUrl ? (
                     <Image
                         src={imageUrl}
                         alt={`Image of ${message.speakerName}`}
                         width={32}
                         height={32}
                         className="rounded-full object-cover border border-gray-300 dark:border-gray-600"
                     />
                 ) : (
                     <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 text-[10px] font-bold">
                         {message.speakerName?.substring(0, 1) || 'P'} 
                     </div>
                 )}
             </div>
            {/* Message Content */} 
            <div className="flex-grow">
                <div className="flex justify-between items-start">
                    <div className="flex-grow">
                        {/* Conditionally translate Moderator name */}
                        <span className={`font-semibold text-gray-900 dark:text-gray-500 ${isModerator ? 'text-blue-800 dark:text-blue-200' : ''}`}>
                            {isModerator ? t('ModeratorLabel', 'Moderator') : message.speakerName}:
                        </span>
                        <span className={`text-gray-800 dark:text-gray-200 ${isModerator ? 'text-blue-800 dark:text-blue-200' : ''}`}>{message.content}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block text-right opacity-75">R{message.round} {message.phase}</span>
                    </div>
                    {/* Button: Now always shown */}
                    {/* {!isModerator && ( */} 
                        <Button // Changed to Button component
                            onClick={audioStatus === 'playing' || audioStatus === 'loading' ? () => stopAndCleanup('user_stop') : playAudio}
                            disabled={false}
                            variant="ghost" // Added variant
                            size="icon" // Added size
                            className="flex-shrink-0 ml-2" // Adjusted className
                            aria-label={audioStatus === 'playing' || audioStatus === 'loading' ? "Stop reading" : "Read message aloud"}
                        >
                            {audioStatus === 'idle' && <Volume className="h-4 w-4 text-gray-500 dark:text-gray-400" />} 
                            {(audioStatus === 'loading' || audioStatus === 'playing') && <Loader2 className="h-4 w-4 text-blue-500 dark:text-blue-400 animate-spin" />}
                            {audioStatus === 'done' && <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />}
                            {audioStatus === 'error' && <span className="h-4 w-4 text-red-500">!</span>} 
                        </Button>
                    {/* )} */}
                </div>
            </div>
        </div>
    );
} 