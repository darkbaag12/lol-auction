package com.gyeongmae.auction;

import org.apache.poi.ss.usermodel.*;
import java.io.FileInputStream;

public class ExcelTest {
    public static void main(String[] args) throws Exception {
        try (FileInputStream fis = new FileInputStream("c:/gyeongmae program/2026-1학기 리그 오브 레전드 멸망전(응답).xlsx");
             Workbook workbook = WorkbookFactory.create(fis)) {
            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(0);
            if (headerRow != null) {
                for (Cell cell : headerRow) {
                    System.out.println("HEADER: " + cell.getStringCellValue());
                }
            }
            Row dataRow = sheet.getRow(1);
            if (dataRow != null) {
                for (Cell cell : dataRow) {
                    System.out.println("DATA 1: " + cell.toString());
                }
            }
        }
    }
}
