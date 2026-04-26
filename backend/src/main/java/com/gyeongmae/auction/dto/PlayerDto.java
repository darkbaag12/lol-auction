package com.gyeongmae.auction.dto;

import lombok.*;

public class PlayerDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CreateRequest {
        private String name;
        private String summonerName;
        private String tier;
        private String rankDivision;
        private int lp;
        private String mainPosition;
        private String subPosition;
        private String mostChampions;
        private Boolean isNewMember;
        private String profileIconUrl;
        private String resolution;
        private Integer startingScore;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Response {
        private Long id;
        private String name;
        private String summonerName;
        private String tier;
        private String rankDivision;
        private int lp;
        private String mainPosition;
        private String subPosition;
        private String mostChampions;
        private Boolean isNewMember;
        private String status;
        private Long teamId;
        private String teamName;
        private Integer soldPrice;
        private String profileIconUrl;
        private String resolution;
        private Integer startingScore;
    }
}
