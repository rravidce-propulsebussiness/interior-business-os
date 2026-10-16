import { describe, expect, it } from 'vitest';
import {
  followPreviousFloor, propagateFloorChanges, restoreFloorFollowing,
  type FloorWork,
} from './construction-floor-inheritance';

const floor = (name: string, lengthFeet: string, widthFeet: string,
  ratePerSqft='1850', inheritFromPrevious?: boolean): FloorWork => ({
  kind: 'floor', name, lengthFeet, widthFeet, ratePerSqft,
  ...(inheritFromPrevious === undefined ? {} : { inheritFromPrevious }),
});

describe('construction floor inheritance', () => {
  it('automatically carries first-floor dimension and rate changes into following floors', () => {
    const input = [
      floor('Ground Floor', '30', '40'),
      floor('First Floor', '20', '40', '1850', true),
      floor('Second Floor', '30', '40', '1850', true),
      floor('Third Floor', '30', '40', '1850', true),
    ];
    const changed = propagateFloorChanges(input, 1, {
      lengthFeet: '25', widthFeet: '40', ratePerSqft: '1950',
    });
    expect(changed[0]).toEqual(input[0]);
    expect(changed[1]).toMatchObject({
      lengthFeet:'25',widthFeet:'40',ratePerSqft:'1950',inheritFromPrevious:false,
    });
    expect(changed[2]).toMatchObject({
      lengthFeet:'25',widthFeet:'40',ratePerSqft:'1950',inheritFromPrevious:true,
    });
    expect(changed[3]).toMatchObject({
      lengthFeet:'25',widthFeet:'40',ratePerSqft:'1950',inheritFromPrevious:true,
    });
  });

  it('respects customized floor, but updates its still-linked next floor', () => {
    const data = [
      floor('Ground Floor','30','40'),
      floor('First Floor','25','40','1850'),
      floor('Second Floor','20','40','1750',false),
      floor('Third Floor','20','40','1750',true),
    ];
    const updated=propagateFloorChanges(data,1,{lengthFeet:'28'});
    expect(updated[2]).toEqual(data[2]);
    expect(updated[3]).toMatchObject({lengthFeet:'20',widthFeet:'40',ratePerSqft:'1750'});
    const relinked=restoreFloorFollowing(updated,2);
    expect(relinked[2]).toMatchObject({lengthFeet:'28',widthFeet:'40',inheritFromPrevious:true});
    expect(relinked[3]).toMatchObject({lengthFeet:'28',widthFeet:'40',inheritFromPrevious:true});
  });

  it('copies the combined footprint from construction plus parking, leaving the parking rate unchanged', () => {
    const rows = [
      floor('Ground Floor','20','25','1850'),
      floor('Ground Floor — Parking','20','25','800'),
      floor('First Floor','1000','1','1850',true),
      floor('Second Floor','1000','1','1850',true),
      floor('Second Floor — Penthouse','10','20','1300'),
    ];
    const changed=propagateFloorChanges(rows,1,{lengthFeet:'30'});
    expect(changed[1].ratePerSqft).toBe('800');
    expect(changed[2]).toMatchObject({lengthFeet:'1250',widthFeet:'1',ratePerSqft:'1850'});
    expect(changed[3]).toMatchObject({lengthFeet:'1250',widthFeet:'1',ratePerSqft:'1850'});
    expect(changed[4]).toEqual(rows[4]);
  });
  it('does not copy additional work items when floor dimensions change', () => {
    const extra: FloorWork = {
      kind:'additional',name:'Shelves & Sajjas',lengthFeet:'12',widthFeet:'2',ratePerSqft:'650',
    };
    const rows=[floor('Ground Floor','30','40'),floor('First Floor','30','40','1850',true),extra];
    const changed=propagateFloorChanges(rows,0,{lengthFeet:'28'});
    expect(changed[1].lengthFeet).toBe('28');
    expect(changed[2]).toEqual(extra);
    expect(followPreviousFloor(changed,1)[2]).toEqual(extra);
  });
});
