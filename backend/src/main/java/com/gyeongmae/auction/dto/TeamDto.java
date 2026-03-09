package com.gyeongmae.auction.dto;

import lombok.*;
import java.util.List;

public class TeamDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CreateRequest {
        private String name;
        private String captainName;
        private Integer startingPoints; // 팀 개별 포인트 (optional)
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Response {
        private Long id;
        private String name;
        private String captainName;
        private int remainingPoints;
        private int filledSlots;
        private int remainingSlots;
        private List<TeamMemberDto> members;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class TeamMemberDto {
        private Long playerId;
        private String summonerName;
        private String assignedPosition;
        private int purchasePrice;
        private String tier;
    }
}
