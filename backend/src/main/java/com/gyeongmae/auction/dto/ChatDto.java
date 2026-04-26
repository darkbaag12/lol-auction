package com.gyeongmae.auction.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

public class ChatDto {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MessageRequest {
        private Long tournamentId;
        private Long teamId;        // null if sent by admin/host
        private String message;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MessageResponse {
        private Long tournamentId;
        private Long teamId;
        private String senderName;  // e.g. "T1 (Faker)" or "관리자"
        private String message;
        private LocalDateTime timestamp;
    }
}
