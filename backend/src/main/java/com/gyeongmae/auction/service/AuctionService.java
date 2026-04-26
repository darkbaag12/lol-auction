package com.gyeongmae.auction.service;

import com.gyeongmae.auction.dto.*;
import com.gyeongmae.auction.entity.*;
import com.gyeongmae.auction.entity.AuctionRound.AuctionRoundStatus;
import com.gyeongmae.auction.entity.Player.PlayerStatus;
import com.gyeongmae.auction.entity.Tournament.TournamentStatus;
import com.gyeongmae.auction.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.apache.poi.ss.usermodel.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@lombok.extern.slf4j.Slf4j
public class AuctionService {

    private final TournamentRepository tournamentRepository;
    private final TeamRepository teamRepository;
    private final PlayerRepository playerRepository;
    private final AuctionRoundRepository auctionRoundRepository;
    private final BidRepository bidRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final SimpMessagingTemplate messagingTemplate;

    // ==================== Tournament ====================

    @Transactional
    public TournamentDto.Response createTournament(TournamentDto.CreateRequest request) {
        Tournament tournament = Tournament.builder()
                .name(request.getName())
                .totalPoints(request.getTotalPoints() > 0 ? request.getTotalPoints() : 1000)
                .bidUnit(request.getBidUnit() > 0 ? request.getBidUnit() : 5)
                .maxTeamSize(request.getMaxTeamSize() > 0 ? request.getMaxTeamSize() : 5)
                .accessCode(request.getAccessCode())
                .build();
        tournament = tournamentRepository.save(tournament);
        return toTournamentResponse(tournament);
    }

    @Transactional(readOnly = true)
    public List<TournamentDto.Response> getTournaments() {
        return tournamentRepository.findAll().stream()
                .map(this::toTournamentResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteTournament(Long tournamentId) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        // Delete all auction rounds first (cascades to bids) to avoid FK constraint violations
        List<AuctionRound> rounds = auctionRoundRepository.findByTournamentIdOrderByRoundNumberAsc(tournamentId);
        auctionRoundRepository.deleteAll(rounds);

        // Detach all players (clear team reference) to avoid FK constraint violations
        List<Player> players = playerRepository.findByTournamentId(tournamentId);
        for (Player p : players) {
            p.setTeam(null);
            playerRepository.save(p);
        }
        // Delete all teams (members cascade via OneToMany CascadeType.ALL)
        List<Team> teams = teamRepository.findByTournamentId(tournamentId);
        teamRepository.deleteAll(teams);
        // Delete all players
        playerRepository.deleteAll(players);
        // Finally delete the tournament
        tournamentRepository.delete(tournament);
    }

    @Transactional
    public void setAccessCode(Long tournamentId, String code) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));
        tournament.setAccessCode(code == null || code.isBlank() ? null : code);
        tournamentRepository.save(tournament);
    }

    @Transactional(readOnly = true)
    public boolean verifyAccessCode(Long tournamentId, String code) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));
        // 코드가 없으면 누구나 입장 가능
        if (tournament.getAccessCode() == null || tournament.getAccessCode().isBlank()) return true;
        return tournament.getAccessCode().equals(code);
    }

    @Transactional(readOnly = true)
    public TournamentDto.Response getTournament(Long id) {
        Tournament tournament = tournamentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found: " + id));
        return toTournamentResponse(tournament);
    }

    @Transactional(readOnly = true)
    public TournamentDto.Response getLatestTournament() {
        Tournament tournament = tournamentRepository.findTopByOrderByIdDesc()
                .orElse(null);
        return tournament != null ? toTournamentResponse(tournament) : null;
    }

    // ==================== Team ====================

    @Transactional
    public TeamDto.Response createTeam(Long tournamentId, TeamDto.CreateRequest request) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        int initialPoints = (request.getStartingPoints() != null && request.getStartingPoints() > 0)
                ? request.getStartingPoints()
                : tournament.getTotalPoints();

        Team team = Team.builder()
                .tournament(tournament)
                .name(request.getName())
                .captainName(request.getCaptainName())
                .remainingPoints(initialPoints)
                .build();
        team = teamRepository.save(team);
        return toTeamResponse(team);
    }

    @Transactional(readOnly = true)
    public List<TeamDto.Response> getTeams(Long tournamentId) {
        return teamRepository.findByTournamentId(tournamentId).stream()
                .map(this::toTeamResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteTeam(Long tournamentId, Long teamId) {
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new IllegalArgumentException("Team not found"));
        // Ensure the team belongs to the tournament
        if (!team.getTournament().getId().equals(tournamentId)) {
            throw new IllegalArgumentException("Team does not belong to this tournament");
        }
        
        // Reset auction rounds won by this team
        List<AuctionRound> wonRounds = auctionRoundRepository.findByWinningTeamId(teamId);
        for (AuctionRound round : wonRounds) {
            round.setWinningTeam(null);
            round.setStatus(AuctionRoundStatus.UNSOLD);
            round.setFinalPrice(null);
            auctionRoundRepository.save(round);
        }

        // Delete all bids made by this team
        List<Bid> teamBids = bidRepository.findByTeamId(teamId);
        if (!teamBids.isEmpty()) {
            bidRepository.deleteAll(teamBids);
        }
        
        // Detach players from the team to bypass foreign key constraints
        List<Player> players = playerRepository.findByTournamentId(tournamentId);
        for (Player p : players) {
            if (p.getTeam() != null && p.getTeam().getId().equals(teamId)) {
                p.setTeam(null);
                p.setSoldPrice(null);
                p.setStatus(Player.PlayerStatus.AVAILABLE); // Or UNSOLD depending on context, keeping AVAILABLE puts them back in pool
                playerRepository.save(p);
            }
        }
        
        teamRepository.delete(team);
    }

    // ==================== Player ====================

    @Transactional
    public PlayerDto.Response createPlayer(Long tournamentId, PlayerDto.CreateRequest request) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        Player player = Player.builder()
                .tournament(tournament)
                .name(request.getName() != null ? request.getName() : request.getSummonerName())
                .summonerName(request.getSummonerName())
                .tier(request.getTier())
                .rankDivision(request.getRankDivision())
                .lp(request.getLp())
                .mainPosition(request.getMainPosition())
                .subPosition(request.getSubPosition())
                .mostChampions(request.getMostChampions())
                .isNewMember(request.getIsNewMember() != null ? request.getIsNewMember() : false)
                .profileIconUrl(request.getProfileIconUrl())
                .resolution(request.getResolution())
                .build();
        player = playerRepository.save(player);
        return toPlayerResponse(player);
    }


    @Transactional
    public List<PlayerDto.Response> createPlayersBulk(Long tournamentId, List<PlayerDto.CreateRequest> requests) {
        return requests.stream()
                .map(req -> createPlayer(tournamentId, req))
                .collect(Collectors.toList());
    }

    @Transactional
    public List<PlayerDto.Response> importPlayersFromExcel(Long tournamentId, MultipartFile file) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        // Delete all existing players for this tournament to overwrite instead of append
        // Use the proper deleteAllPlayers method to handle foreign key constraints (auction rounds, bids, etc.)
        deleteAllPlayers(tournamentId);

        List<Player> importedPlayers = new ArrayList<>();
        try (InputStream is = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(is)) {

            Sheet sheet = workbook.getSheetAt(0);
            boolean isHeader = true;

            int nameIdx = 0, summonerIdx = 1, tierIdx = 2, mainPosIdx = 3, subPosIdx = 4, champsIdx = 5;
            int isNewMemberIdx = -1, isCaptainAppliedIdx = -1, resolutionIdx = -1, scoreIdx = -1;

            for (Row row : sheet) {
                StringBuilder debugHeaders = new StringBuilder("Headers: \n");
                if (isHeader) {
                    isHeader = false;
                    for (Cell cell : row) {
                        String rawHeader = getCellValueAsString(cell);
                        String header = rawHeader.trim().replace(" ", "");
                        System.out.println("HEADER DUMP [" + cell.getColumnIndex() + "]: " + rawHeader + " -> " + header);
                        debugHeaders.append(cell.getColumnIndex()).append(":").append(header).append(" | ");
                        if (header.contains("성명") || header.contains("이름")) nameIdx = cell.getColumnIndex();
                        else if (header.contains("닉네임")) summonerIdx = cell.getColumnIndex();
                        else if (tierIdx == 2 && ((header.contains("티어") || header.contains("최고") || header.contains("랭크") || header.contains("계급") || header.contains("등급")) && !header.contains("시즌"))) tierIdx = cell.getColumnIndex();
                        else if (header.contains("주라인") || header.contains("주포지션") || header.contains("역할군")) mainPosIdx = cell.getColumnIndex();
                        else if (header.contains("부라인") || header.contains("부포지션")) subPosIdx = cell.getColumnIndex();
                        else if (header.contains("선호챔피언") || header.contains("모스트") || header.contains("선호요원")) champsIdx = cell.getColumnIndex();
                        else if (header.contains("팀장지원여부") || header.equals("팀장여부") || header.equals("팀장")) isCaptainAppliedIdx = cell.getColumnIndex();
                        else if (header.contains("신입회원여부") || header.equals("신입여부") || header.equals("신입")) isNewMemberIdx = cell.getColumnIndex();
                        else if (header.contains("각오") || header.contains("한마디")) resolutionIdx = cell.getColumnIndex();
                        else if (header.contains("기준가") || header.equals("점수") || header.equals("시작점수") || header.equals("시작가") || header.equals("기본점수")) scoreIdx = cell.getColumnIndex();
                    }
                    try {
                        java.nio.file.Files.writeString(java.nio.file.Paths.get("excel_debug2.txt"), debugHeaders.toString() + "\n", java.nio.file.StandardOpenOption.CREATE);
                    } catch(Exception e) {}
                    continue;
                }

                // Check for empty rows
                Cell nameCell = row.getCell(nameIdx);
                Cell summonerCell = row.getCell(summonerIdx);
                if ((nameCell == null || nameCell.getCellType() == CellType.BLANK) &&
                    (summonerCell == null || summonerCell.getCellType() == CellType.BLANK)) {
                    continue;
                }

                String name = getCellValueAsString(row.getCell(nameIdx));
                String summonerName = getCellValueAsString(row.getCell(summonerIdx)); // Nickname#Tag

                // 엑셀 파싱 디버그용 파일 출력
                try {
                    StringBuilder sb = new StringBuilder();
                    sb.append("Row name:").append(name).append(" (tierIdx:").append(tierIdx).append(")");
                    for(int c=0; c<=9; c++) {
                        sb.append(" | C").append(c).append(":").append(getCellValueAsString(row.getCell(c)));
                    }
                    sb.append("\n");
                    java.nio.file.Files.writeString(java.nio.file.Paths.get("excel_debug2.txt"), sb.toString(), 
                        java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
                } catch(Exception e) {}
                
                System.out.println("ROW DUMP: " + name + " / " + summonerName + " / captain:" + (isCaptainAppliedIdx != -1 ? getCellValueAsString(row.getCell(isCaptainAppliedIdx)) : "null"));
                
                // 팀장 지원 여부가 O, ㅇ, 0, Y 등인 경우 건너뛰기
                if (isCaptainAppliedIdx != -1) {
                    String captainApplied = getCellValueAsString(row.getCell(isCaptainAppliedIdx)).trim().toUpperCase();
                    if (captainApplied.equals("O") || captainApplied.equals("0") || captainApplied.equals("ㅇ") || captainApplied.equals("Y") || captainApplied.equals("TRUE") || captainApplied.contains("팀장")) {
                        continue;
                    }
                }

                String tierString = getCellValueAsString(row.getCell(tierIdx)); // ex: E1, G3
                String mainPositionStr = getCellValueAsString(row.getCell(mainPosIdx));
                String subPositionStr = getCellValueAsString(row.getCell(subPosIdx));
                String mostChampions = getCellValueAsString(row.getCell(champsIdx));
                
                boolean isNewMember = false;
                if (isNewMemberIdx != -1) {
                    String newMemberStr = getCellValueAsString(row.getCell(isNewMemberIdx)).trim().toUpperCase();
                    if (newMemberStr.equals("O") || newMemberStr.equals("0") || newMemberStr.equals("ㅇ") || newMemberStr.equals("Y") || newMemberStr.equals("TRUE") || newMemberStr.contains("신입")) {
                        isNewMember = true;
                    }
                }
                String resolution = resolutionIdx != -1 ? getCellValueAsString(row.getCell(resolutionIdx)) : "";
                
                Integer startingScore = null;
                if (scoreIdx != -1) {
                    String scoreStr = getCellValueAsString(row.getCell(scoreIdx)).trim();
                    if (!scoreStr.isEmpty()) {
                        String numericStr = scoreStr.replaceAll("[^0-9-]", "");
                        if (!numericStr.isEmpty() && !numericStr.equals("-")) {
                            try {
                                startingScore = Integer.parseInt(numericStr);
                            } catch (NumberFormatException e) {
                                log.warn("Invalid startingScore format for row {}: {}", row.getRowNum(), scoreStr);
                            }
                        }
                    }
                }

                String mappedTier = mapTier(tierString);
                String mappedDivision = mapDivision(tierString);
                int extractedLp = extractLp(tierString);
                String mappedMainPos = mapPosition(mainPositionStr);
                String mappedSubPos = mapPosition(subPositionStr);

                Player player = Player.builder()
                        .tournament(tournament)
                        .name(name != null && !name.isEmpty() ? name : summonerName)
                        .summonerName(summonerName != null && !summonerName.isEmpty() ? summonerName : name)
                        .tier(mappedTier)
                        .rankDivision(mappedDivision)
                        .mainPosition(mappedMainPos)
                        .subPosition(mappedSubPos)
                        .mostChampions(mostChampions)
                        .isNewMember(isNewMember)
                        .lp(extractedLp)
                        .resolution(resolution)
                        .startingScore(startingScore)
                        .build();

                importedPlayers.add(player);
            }
        } catch (Exception e) {
            throw new RuntimeException("엑셀 파일 파싱 중 오류가 발생했습니다: " + e.getMessage());
        }

        importedPlayers = playerRepository.saveAll(importedPlayers);
        return importedPlayers.stream().map(this::toPlayerResponse).collect(Collectors.toList());
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> String.valueOf((int) cell.getNumericCellValue());
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            default -> "";
        };
    }

    private String mapTier(String tierStr) {
        if (tierStr == null || tierStr.length() < 1) return "IRON";
        
        String upperTier = tierStr.toUpperCase().trim();
        // 한글 매핑 처리
        if (upperTier.contains("아이언") || upperTier.startsWith("아")) return "IRON";
        if (upperTier.contains("브론즈") || upperTier.startsWith("브")) return "BRONZE";
        if (upperTier.contains("실버") || upperTier.startsWith("실")) return "SILVER";
        if (upperTier.contains("골드") || upperTier.startsWith("골")) return "GOLD";
        if (upperTier.contains("플래") || upperTier.contains("플레") || upperTier.startsWith("플")) return "PLATINUM";
        if (upperTier.contains("에메랄드") || upperTier.contains("애메랄드") || upperTier.startsWith("에") || upperTier.startsWith("애")) return "EMERALD";
        if (upperTier.contains("다이아") || upperTier.startsWith("다")) return "DIAMOND";
        if (upperTier.contains("초월자") || upperTier.contains("ASCENDANT") || upperTier.startsWith("초")) return "ASCENDANT";
        if (upperTier.contains("불멸") || upperTier.contains("IMMORTAL") || upperTier.startsWith("불")) return "IMMORTAL";
        if (upperTier.contains("레디언트") || upperTier.contains("RADIANT") || upperTier.startsWith("레")) return "RADIANT";
        if (upperTier.contains("언랭") || upperTier.contains("UNRANK") || upperTier.startsWith("언")) return "UNRANKED";
        if (upperTier.contains("그마") || upperTier.contains("그랜드마스터")) return "GRANDMASTER";
        if (upperTier.contains("마스터") || upperTier.startsWith("마")) return "MASTER";
        if (upperTier.contains("챌") || upperTier.contains("첼")) return "CHALLENGER";

        char t = upperTier.charAt(0);
        return switch (t) {
            case 'I' -> upperTier.contains("IM") ? "IMMORTAL" : "IRON";
            case 'B' -> "BRONZE";
            case 'S' -> "SILVER";
            case 'G' -> "GOLD";
            case 'P' -> "PLATINUM";
            case 'E' -> "EMERALD";
            case 'D' -> "DIAMOND";
            case 'M' -> "MASTER";
            case 'C' -> "CHALLENGER";
            case 'A' -> "ASCENDANT";
            case 'R' -> "RADIANT";
            case 'U' -> "UNRANKED";
            default -> "IRON";
        };
    }

    private String mapDivision(String tierStr) {
        if (tierStr == null || tierStr.length() < 1) return "";
        
        String upperTier = tierStr.toUpperCase().trim();
        if (upperTier.contains("언랭") || upperTier.contains("UNRANK")) return "";

        // 마스터, 불멸, 레디언트 이상은 디비전이 없음
        if (upperTier.contains("마스터") || upperTier.contains("그마") || upperTier.contains("챌") || 
            upperTier.contains("불멸") || upperTier.contains("레디언트") || upperTier.contains("IMMORTAL") || upperTier.contains("RADIANT") ||
            upperTier.startsWith("M") || upperTier.startsWith("GM") || upperTier.startsWith("C")) {
            return "";
        }
        
        // 숫자만 추출해서 디비전 매핑
        String numberOnly = tierStr.replaceAll("[^1-4]", "");
        if (!numberOnly.isEmpty()) {
            char d = numberOnly.charAt(0);
            return switch (d) {
                case '1' -> "1";
                case '2' -> "2";
                case '3' -> "3";
                case '4' -> "4";
                default -> "1";
            };
        }
        return "1";
    }

    private int extractLp(String tierStr) {
        if (tierStr == null || tierStr.isEmpty()) return 0;
        
        // M, GM, C 등 마스터 이상 티어인 경우 점수 추출
        String upper = tierStr.toUpperCase();
        if (upper.startsWith("M") || upper.startsWith("GM") || upper.startsWith("C") || 
            upper.contains("마스터") || upper.contains("그마") || upper.contains("그랜드마스터") || upper.contains("챌") ||
            upper.contains("불멸") || upper.contains("레디언트") || upper.contains("IMMORTAL") || upper.contains("RADIANT")) {
            // 정규표현식으로 숫자만 추출
            String numberOnly = tierStr.replaceAll("[^0-9]", "");
            if (!numberOnly.isEmpty()) {
                try {
                    return Integer.parseInt(numberOnly);
                } catch (NumberFormatException e) {
                    return 0;
                }
            }
        }
        return 0;
    }

    private String mapPosition(String pos) {
        if (pos == null || pos.isEmpty() || pos.equals("없음")) return "";
        String p = pos.trim().toUpperCase();
        if (p.contains("탑") || p.equals("TOP")) return "TOP";
        if (p.contains("정글") || p.equals("JUNGLE")) return "JUNGLE";
        if (p.contains("미드") || p.equals("MID")) return "MID";
        if (p.contains("원딜") || p.equals("ADC")) return "ADC";
        if (p.contains("서포터") || p.contains("서폿") || p.equals("SUP") || p.equals("SUPPORT")) return "SUPPORT";
        if (p.contains("타격대") || p.equals("DUELIST")) return "DUELIST";
        if (p.contains("척후대") || p.equals("INITIATOR")) return "INITIATOR";
        if (p.contains("전략가") || p.equals("CONTROLLER")) return "CONTROLLER";
        if (p.contains("감시자") || p.equals("SENTINEL")) return "SENTINEL";
        if (p.contains("올라운더") || p.equals("FLEX") || p.equals("ALL")) return "FLEX";
        return p;
    }

    @Transactional(readOnly = true)
    public List<PlayerDto.Response> getPlayers(Long tournamentId) {
        return playerRepository.findByTournamentId(tournamentId).stream()
                .map(this::toPlayerResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteAllPlayers(Long tournamentId) {
        tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));
        
        List<Player> existingPlayers = playerRepository.findByTournamentId(tournamentId);
        if (!existingPlayers.isEmpty()) {
            // Delete dependent records first to avoid foreign key violations
            List<AuctionRound> rounds = auctionRoundRepository.findByTournamentIdOrderByRoundNumberAsc(tournamentId);
            auctionRoundRepository.deleteAll(rounds);

            for (Player player : existingPlayers) {
                if (player.getTeam() != null) {
                    Team team = player.getTeam();
                    // Remove from Team Members
                    List<TeamMember> members = teamMemberRepository.findByTeamId(team.getId());
                    members.stream().filter(m -> m.getPlayer().getId().equals(player.getId()))
                           .findFirst().ifPresent(member -> teamMemberRepository.delete(member));
                    
                    // Refund points
                    team.setRemainingPoints(team.getRemainingPoints() + player.getSoldPrice());
                    teamRepository.save(team);
                }
            }

            playerRepository.deleteAll(existingPlayers);
        }
    }

    // ==================== Auction ====================

    @Transactional
    public AuctionDto.RoundResponse startAuctionRound(Long tournamentId, AuctionDto.StartRequest request) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        // Ensure no other active round
        auctionRoundRepository.findByTournamentIdAndStatus(tournamentId, AuctionRoundStatus.ACTIVE)
                .ifPresent(r -> { throw new IllegalStateException("이미 진행 중인 경매가 있습니다."); });

        Player player = playerRepository.findById(request.getPlayerId())
                .orElseThrow(() -> new IllegalArgumentException("Player not found"));

        if (player.getStatus() != PlayerStatus.AVAILABLE && player.getStatus() != PlayerStatus.UNSOLD) {
            throw new IllegalStateException("이 선수는 현재 경매에 올릴 수 없습니다: " + player.getStatus());
        }

        // Update tournament status
        if (tournament.getStatus() == TournamentStatus.READY) {
            tournament.setStatus(TournamentStatus.IN_PROGRESS);
            tournamentRepository.save(tournament);
        }

        int roundNumber = auctionRoundRepository.countByTournamentId(tournamentId) + 1;
        boolean isReAuction = player.getStatus() == PlayerStatus.UNSOLD;
        int startingPrice = isReAuction ? 0 : request.getStartingPrice();

        AuctionRound round = AuctionRound.builder()
                .tournament(tournament)
                .player(player)
                .roundNumber(roundNumber)
                .startingPrice(startingPrice)
                .isReAuction(isReAuction)
                .status(AuctionRoundStatus.ACTIVE)
                .startedAt(LocalDateTime.now())
                .build();
        round = auctionRoundRepository.save(round);

        player.setStatus(PlayerStatus.AUCTIONING);
        playerRepository.save(player);

        AuctionDto.RoundResponse response = toRoundResponse(round);

        // Broadcast to all clients
        broadcast(tournamentId, "ROUND_START", response);

        return response;
    }

    @Transactional
    public AuctionDto.BidResponse placeBid(AuctionDto.BidRequest request) {
        AuctionRound round = auctionRoundRepository.findById(request.getRoundId())
                .orElseThrow(() -> new IllegalArgumentException("Auction round not found"));

        if (round.getStatus() != AuctionRoundStatus.ACTIVE) {
            throw new IllegalStateException("경매가 진행 중이 아닙니다.");
        }

        Team team = teamRepository.findById(request.getTeamId())
                .orElseThrow(() -> new IllegalArgumentException("Team not found"));

        // Validation 1: Bid unit (Removed to allow 1-point increments)
        // if (request.getAmount() % tournament.getBidUnit() != 0) {
        //     throw new IllegalArgumentException("입찰 금액은 " + tournament.getBidUnit() + "포인트 단위여야 합니다.");
        // }

        // Validation 2: Higher than current highest or tied at maxPrice
        int currentHighest = round.getCurrentHighestBid();
        Integer maxPrice = round.isReAuction() ? null : round.getStartingPrice() + 20;

        if (maxPrice != null && request.getAmount() > maxPrice) {
            throw new IllegalArgumentException("상한가(" + maxPrice + "P)를 초과하여 입찰할 수 없습니다.");
        }

        // Self-outbid prevention
        round.getBids().stream()
                .reduce((a, b) -> a.getBidAmount() >= b.getBidAmount() ? a : b)
                .ifPresent(highestBid -> {
                    if (highestBid.getTeam().getId().equals(team.getId()) 
                            && !(maxPrice != null && request.getAmount() == maxPrice && highestBid.getBidAmount() == maxPrice)) {
                        throw new IllegalArgumentException("이미 최고가 입찰자입니다.");
                    }
                });

        if (request.getAmount() <= currentHighest) {
            boolean isInitialBid = request.getAmount() == currentHighest && round.getBids().isEmpty();
            boolean isMaxPriceTie = maxPrice != null && request.getAmount() == maxPrice && currentHighest == maxPrice;

            if (isMaxPriceTie) {
                boolean alreadyBiddedMax = round.getBids().stream()
                        .anyMatch(b -> b.getTeam().getId().equals(team.getId()) && b.getBidAmount() == maxPrice);
                if (alreadyBiddedMax) {
                    throw new IllegalArgumentException("이미 상한가 입찰에 참여했습니다.");
                }
            }
            
            if (!isInitialBid && !isMaxPriceTie) {
                log.warn("Rejected invalid bid from team {} for amount {}. Current highest is {}", team.getName(), request.getAmount(), currentHighest);
                throw new IllegalArgumentException("현재 최고가(" + currentHighest + ")보다 높은 금액을 입찰해야 합니다.");
            }
        }

        // Validation 3: Enough remaining points
        if (team.getRemainingPoints() < request.getAmount()) {
            throw new IllegalArgumentException("포인트가 부족합니다. 잔여: " + team.getRemainingPoints());
        }



        // Validation 5: Team has available slots
        if (team.getRemainingSlots() <= 0) {
            throw new IllegalArgumentException("팀에 빈 슬롯이 없습니다.");
        }

        Bid bid = Bid.builder()
                .auctionRound(round)
                .team(team)
                .bidAmount(request.getAmount())
                .build();
        bid = bidRepository.save(bid);

        java.util.Map<Long, Integer> teamsPoints = teamRepository.findAll()
                .stream()
                .collect(Collectors.toMap(Team::getId, Team::getRemainingPoints));

        AuctionDto.BidResponse response = AuctionDto.BidResponse.builder()
                .bidId(bid.getId())
                .teamId(team.getId())
                .teamName(team.getName())
                .amount(bid.getBidAmount())
                .timestamp(bid.getBidTime().toString())
                .teamsPoints(teamsPoints)
                .build();

        // Broadcast bid update
        Long tournamentId = round.getTournament().getId();
        broadcast(tournamentId, "NEW_BID", response);

        return response;
    }

    @Transactional
    public AuctionDto.RoundResponse closeAuctionRound(AuctionDto.CloseRequest request) {
        AuctionRound round = auctionRoundRepository.findById(request.getRoundId())
                .orElseThrow(() -> new IllegalArgumentException("Auction round not found"));

        if (round.getStatus() != AuctionRoundStatus.ACTIVE) {
            throw new IllegalStateException("진행 중인 경매만 종료할 수 있습니다.");
        }

        List<Bid> bids = bidRepository.findByAuctionRoundIdOrderByBidTimeDesc(round.getId());

        if (bids.isEmpty()) {
            // No bids — UNSOLD
            return passAuctionRound(request.getRoundId());
        }

        // Get highest bid or specified team bid
        Bid winningBid;
        if (request.getWinningTeamId() != null) {
            int topAmount = bids.stream().mapToInt(Bid::getBidAmount).max().orElseThrow(() -> new IllegalStateException("입찰 내역이 없습니다."));
            winningBid = bids.stream()
                    .filter(b -> b.getBidAmount() == topAmount && b.getTeam().getId().equals(request.getWinningTeamId()))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("선택한 팀이 최고가 입찰자가 아닙니다."));
        } else {
            winningBid = bids.stream()
                    .reduce((a, b) -> a.getBidAmount() >= b.getBidAmount() ? a : b)
                    .orElseThrow(() -> new IllegalStateException("입찰 내역이 없습니다."));
        }

        Team winningTeam = winningBid.getTeam();
        Player player = round.getPlayer();

        // Update round
        round.setStatus(AuctionRoundStatus.SOLD);
        round.setFinalPrice(winningBid.getBidAmount());
        round.setWinningTeam(winningTeam);
        round.setEndedAt(LocalDateTime.now());
        auctionRoundRepository.save(round);

        // Update player
        player.setStatus(PlayerStatus.SOLD);
        player.setTeam(winningTeam);
        player.setSoldPrice(winningBid.getBidAmount());
        playerRepository.save(player);

        // Update team points
        winningTeam.setRemainingPoints(winningTeam.getRemainingPoints() - winningBid.getBidAmount());
        teamRepository.save(winningTeam);

        // Create team member
        TeamMember member = TeamMember.builder()
                .team(winningTeam)
                .player(player)
                .assignedPosition(player.getMainPosition())
                .purchasePrice(winningBid.getBidAmount())
                .build();
        teamMemberRepository.save(member);

        AuctionDto.RoundResponse response = toRoundResponse(round);

        Long tournamentId = round.getTournament().getId();
        broadcast(tournamentId, "ROUND_SOLD", response);

        return response;
    }

    @Transactional
    public AuctionDto.RoundResponse passAuctionRound(Long roundId) {
        AuctionRound round = auctionRoundRepository.findById(roundId)
                .orElseThrow(() -> new IllegalArgumentException("Auction round not found"));

        round.setStatus(AuctionRoundStatus.UNSOLD);
        round.setEndedAt(LocalDateTime.now());
        auctionRoundRepository.save(round);

        Player player = round.getPlayer();
        player.setStatus(PlayerStatus.UNSOLD);
        playerRepository.save(player);

        AuctionDto.RoundResponse response = toRoundResponse(round);

        Long tournamentId = round.getTournament().getId();
        broadcast(tournamentId, "ROUND_UNSOLD", response);

        return response;
    }

    @Transactional
    public void rollbackAuctionRound(Long roundId) {
        AuctionRound round = auctionRoundRepository.findById(roundId)
                .orElseThrow(() -> new IllegalArgumentException("Auction round not found"));

        if (round.getStatus() == AuctionRoundStatus.ACTIVE) {
            throw new IllegalStateException("진행 중인 경매는 롤백할 수 없습니다.");
        }

        Player player = round.getPlayer();

        // 1. If it was sold, we must revert points and remove TeamMember
        if (round.getStatus() == AuctionRoundStatus.SOLD) {
            Team winningTeam = round.getWinningTeam();
            if (winningTeam != null) {
                // Return points
                winningTeam.setRemainingPoints(winningTeam.getRemainingPoints() + round.getFinalPrice());
                teamRepository.save(winningTeam);

                // Remove team member
                teamMemberRepository.findByTeamId(winningTeam.getId()).stream()
                        .filter(m -> m.getPlayer().getId().equals(player.getId()))
                        .findFirst()
                        .ifPresent(teamMemberRepository::delete);
            }
        }

        // 2. Revert player state
        player.setStatus(round.isReAuction() ? PlayerStatus.UNSOLD : PlayerStatus.AVAILABLE);
        player.setTeam(null);
        player.setSoldPrice(0);
        playerRepository.save(player);

        // 3. Delete bids and auction round completely
        List<Bid> bids = bidRepository.findByAuctionRoundIdOrderByBidTimeDesc(roundId);
        bidRepository.deleteAll(bids);
        auctionRoundRepository.delete(round);

        // 4. Fire websocket event so clients refresh their data
        Long tournamentId = round.getTournament().getId();
        broadcast(tournamentId, "ROUND_SOLD", null); // triggers client refresh
    }

    @Transactional
    public void rollbackLastBid(Long roundId) {
        AuctionRound round = auctionRoundRepository.findById(roundId)
                .orElseThrow(() -> new IllegalArgumentException("Auction round not found"));

        if (round.getStatus() != AuctionRoundStatus.ACTIVE) {
            throw new IllegalStateException("진행 중인 경매에서만 입찰을 취소할 수 있습니다.");
        }

        List<Bid> bids = bidRepository.findByAuctionRoundIdOrderByBidTimeDesc(roundId);
        if (bids.isEmpty()) {
            throw new IllegalStateException("취소할 입찰 내역이 없습니다.");
        }

        Bid lastBid = bids.get(0);
        bidRepository.delete(lastBid);

        // Notify clients about the rollback
        Long tournamentId = round.getTournament().getId();
        broadcast(tournamentId, "BID_ROLLBACK", null); // Clients will fetch new bid history
    }

    @Transactional(readOnly = true)
    public List<AuctionDto.BidResponse> getBidHistory(Long roundId) {
        return bidRepository.findByAuctionRoundIdOrderByBidTimeDesc(roundId).stream()
                .map(bid -> AuctionDto.BidResponse.builder()
                        .bidId(bid.getId())
                        .teamId(bid.getTeam().getId())
                        .teamName(bid.getTeam().getName())
                        .amount(bid.getBidAmount())
                        .timestamp(bid.getBidTime().toString())
                        .build())
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public AuctionDto.RoundResponse getActiveRound(Long tournamentId) {
        AuctionRound round = auctionRoundRepository
                .findByTournamentIdAndStatus(tournamentId, AuctionRoundStatus.ACTIVE)
                .orElse(null);
        return round != null ? toRoundResponse(round) : null;
    }

    @Transactional(readOnly = true)
    public List<AuctionDto.RoundResponse> getAuctionHistory(Long tournamentId) {
        return auctionRoundRepository.findByTournamentIdOrderByRoundNumberAsc(tournamentId).stream()
                .filter(r -> r.getStatus() != AuctionRoundStatus.ACTIVE)
                .map(this::toRoundResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public AuctionDto.RoundResponse manualAssignPlayer(Long tournamentId, AuctionDto.ManualAssignRequest request) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        Player player = playerRepository.findById(request.getPlayerId())
                .orElseThrow(() -> new IllegalArgumentException("Player not found"));

        if (player.getStatus() != PlayerStatus.AVAILABLE && player.getStatus() != PlayerStatus.UNSOLD) {
            throw new IllegalStateException("이 선수는 수동 배정할 수 없는 상태입니다: " + player.getStatus());
        }

        Team team = teamRepository.findById(request.getTeamId())
                .orElseThrow(() -> new IllegalArgumentException("Team not found"));

        if (!team.getTournament().getId().equals(tournamentId)) {
            throw new IllegalArgumentException("해당 팀은 이 대회 소속이 아닙니다.");
        }

        if (team.getRemainingPoints() < request.getAmount()) {
            throw new IllegalArgumentException("포인트가 부족합니다. 잔여: " + team.getRemainingPoints());
        }

        if (team.getRemainingSlots() <= 0) {
            throw new IllegalArgumentException("팀에 빈 슬롯이 없습니다.");
        }

        int roundNumber = auctionRoundRepository.countByTournamentId(tournamentId) + 1;

        AuctionRound mockRound = AuctionRound.builder()
                .tournament(tournament)
                .player(player)
                .roundNumber(roundNumber)
                .startingPrice(request.getAmount())
                .isReAuction(false)
                .status(AuctionRoundStatus.SOLD)
                .finalPrice(request.getAmount())
                .winningTeam(team)
                .startedAt(LocalDateTime.now())
                .endedAt(LocalDateTime.now())
                .build();
        
        mockRound = auctionRoundRepository.save(mockRound);

        player.setStatus(PlayerStatus.SOLD);
        player.setTeam(team);
        player.setSoldPrice(request.getAmount());
        playerRepository.save(player);

        team.setRemainingPoints(team.getRemainingPoints() - request.getAmount());
        teamRepository.save(team);

        TeamMember member = TeamMember.builder()
                .team(team)
                .player(player)
                .assignedPosition(player.getMainPosition())
                .purchasePrice(request.getAmount())
                .build();
        teamMemberRepository.save(member);

        AuctionDto.RoundResponse response = toRoundResponse(mockRound);
        broadcast(tournamentId, "ROUND_SOLD", response);

        return response;
    }

    // ==================== Broadcasting ====================

    private void broadcast(Long tournamentId, String type, Object data) {
        AuctionDto.WsMessage message = AuctionDto.WsMessage.builder()
                .type(type)
                .data(data)
                .build();
        messagingTemplate.convertAndSend("/topic/auction/" + tournamentId, message);
    }

    // ==================== Chat ====================
    public void handleChatMessage(ChatDto.MessageRequest request) {
        String senderName = "관리자";
        if (request.getTeamId() != null) {
            Team team = teamRepository.findById(request.getTeamId()).orElse(null);
            if (team != null) {
                senderName = team.getName() + " (" + team.getCaptainName() + ")";
            }
        }

        ChatDto.MessageResponse response = ChatDto.MessageResponse.builder()
                .tournamentId(request.getTournamentId())
                .teamId(request.getTeamId())
                .senderName(senderName)
                .message(request.getMessage())
                .timestamp(LocalDateTime.now())
                .build();

        broadcast(request.getTournamentId(), "CHAT", response);
    }

    // ==================== Mappers ====================

    private TournamentDto.Response toTournamentResponse(Tournament t) {
        List<TeamDto.Response> teamResponses = t.getTeams() != null
                ? t.getTeams().stream().map(this::toTeamResponse).collect(Collectors.toList())
                : List.of();

        return TournamentDto.Response.builder()
                .id(t.getId())
                .name(t.getName())
                .totalPoints(t.getTotalPoints())
                .bidUnit(t.getBidUnit())
                .maxTeamSize(t.getMaxTeamSize())
                .status(t.getStatus().name())
                .hasAccessCode(t.getAccessCode() != null && !t.getAccessCode().isBlank())
                .teams(teamResponses)
                .build();
    }

    private TeamDto.Response toTeamResponse(Team t) {
        List<TeamDto.TeamMemberDto> memberDtos = t.getMembers() != null
                ? t.getMembers().stream().map(m -> TeamDto.TeamMemberDto.builder()
                        .playerId(m.getPlayer().getId())
                        .summonerName(m.getPlayer().getSummonerName())
                        .assignedPosition(m.getAssignedPosition())
                        .purchasePrice(m.getPurchasePrice())
                        .tier(m.getPlayer().getTier())
                        .build())
                .collect(Collectors.toList())
                : List.of();

        return TeamDto.Response.builder()
                .id(t.getId())
                .name(t.getName())
                .captainName(t.getCaptainName())
                .remainingPoints(t.getRemainingPoints())
                .filledSlots(t.getFilledSlots())
                .remainingSlots(t.getRemainingSlots())
                .members(memberDtos)
                .build();
    }

    private PlayerDto.Response toPlayerResponse(Player p) {
        return PlayerDto.Response.builder()
                .id(p.getId())
                .name(p.getName())
                .summonerName(p.getSummonerName())
                .tier(p.getTier())
                .rankDivision(p.getRankDivision())
                .lp(p.getLp())
                .mainPosition(p.getMainPosition())
                .subPosition(p.getSubPosition())
                .mostChampions(p.getMostChampions())
                .isNewMember(p.getIsNewMember())
                .status(p.getStatus().name())
                .teamId(p.getTeam() != null ? p.getTeam().getId() : null)
                .teamName(p.getTeam() != null ? p.getTeam().getName() : null)
                .soldPrice(p.getSoldPrice())
                .profileIconUrl(p.getProfileIconUrl())
                .resolution(p.getResolution())
                .startingScore(p.getStartingScore())
                .build();
    }

    private AuctionDto.RoundResponse toRoundResponse(AuctionRound r) {
        Bid highestBid = r.getBids() != null
                ? r.getBids().stream().reduce((a, b) -> a.getBidAmount() >= b.getBidAmount() ? a : b).orElse(null)
                : null;
        Integer maxPrice = r.isReAuction() ? null : r.getStartingPrice() + 20;

        return AuctionDto.RoundResponse.builder()
                .roundId(r.getId())
                .roundNumber(r.getRoundNumber())
                .player(toPlayerResponse(r.getPlayer()))
                .startingPrice(r.getStartingPrice())
                .maxPrice(maxPrice)
                .currentPrice(highestBid != null ? highestBid.getBidAmount() : r.getStartingPrice())
                .highestBidderTeam(highestBid != null ? highestBid.getTeam().getName() : null)
                .status(r.getStatus().name())
                .build();
    }
}
