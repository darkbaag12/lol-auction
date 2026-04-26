package com.gyeongmae.auction.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class WebSocketPresenceService {

    // K=TeamId, V=SessionId
    private final Map<String, String> teamActiveSessions = new ConcurrentHashMap<>();
    // K=SessionId, V=TeamId
    private final Map<String, String> sessionTeamMap = new ConcurrentHashMap<>();

    public boolean registerCaptainSession(String sessionId, String teamId) {
        // Use computeIfAbsent to atomically check and set the active session for the team
        String existingSession = teamActiveSessions.computeIfAbsent(teamId, k -> {
            sessionTeamMap.put(sessionId, teamId);
            return sessionId;
        });

        if (!existingSession.equals(sessionId)) {
            // Team ID is already registered under a different session
            log.warn("Blocked duplicate captain connection for Team ID: {} (existing session: {}, new: {})", teamId, existingSession, sessionId);
            return false;
        }
        log.info("Registered captain session for Team ID: {} (Session ID: {})", teamId, sessionId);
        return true;
    }

    public void removeSession(String sessionId) {
        String teamId = sessionTeamMap.remove(sessionId);
        if (teamId != null) {
            teamActiveSessions.remove(teamId);
            log.info("Removed captain session for Team ID: {} (Session ID: {})", teamId, sessionId);
        }
    }
}
