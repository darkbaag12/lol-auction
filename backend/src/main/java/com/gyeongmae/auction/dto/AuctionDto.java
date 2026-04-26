package com.gyeongmae.auction.dto;

import lombok.*;

public class AuctionDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class StartRequest {
        private Long playerId;
        private int startingPrice;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CloseRequest {
        private Long roundId;
        private Long winningTeamId;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class BidRequest {
        private Long roundId;
        private Long teamId;
        private int amount;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class RoundResponse {
        private Long roundId;
        private int roundNumber;
        private PlayerDto.Response player;
        private int startingPrice;
        private Integer maxPrice;
        private int currentPrice;
        private String highestBidderTeam;
        private String status;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class BidResponse {
        private Long bidId;
        private Long teamId;
        private String teamName;
        private int amount;
        private String timestamp;
        private java.util.Map<Long, Integer> teamsPoints;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class WsMessage {
        private String type;
        private Object data;
    }
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ManualAssignRequest {
        private Long playerId;
        private Long teamId;
        private int amount;
    }
}
